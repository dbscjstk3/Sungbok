import { createAdminClient } from '@insforge/sdk'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

const MAX_FILE_SIZE = 25 * 1024 * 1024
const MAX_DURATION_SECONDS = 30
const TOKEN_LIFETIME_MS = 10 * 60 * 1000
const ACCEPTED_TYPES = new Set(['video/mp4', 'video/webm'])

interface UploadDetails {
  uploaderName: string
  title: string
  duration: number
  fileSize: number
  contentType: string
}

interface UploadTokenPayload extends UploadDetails {
  videoKey: string
  expiresAt: number
}

function getConfig() {
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL
  const apiKey = process.env.INSFORGE_API_KEY
  return baseUrl && apiKey ? { baseUrl, apiKey } : null
}

function validateDetails(value: unknown): UploadDetails | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  const uploaderName = String(input.uploaderName ?? '').trim()
  const title = String(input.title ?? '').trim()
  const duration = Number(input.duration)
  const fileSize = Number(input.fileSize)
  const contentType = String(input.contentType ?? '')

  if (uploaderName.length < 1 || uploaderName.length > 30) return null
  if (title.length < 1 || title.length > 80) return null
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_DURATION_SECONDS) return null
  if (!Number.isInteger(fileSize) || fileSize < 1 || fileSize > MAX_FILE_SIZE) return null
  if (!ACCEPTED_TYPES.has(contentType)) return null

  return { uploaderName, title, duration, fileSize, contentType }
}

function signUpload(payload: UploadTokenPayload, secret: string) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url')
  return `${encodedPayload}.${signature}`
}

function verifyUpload(token: unknown, secret: string): UploadTokenPayload | null {
  if (typeof token !== 'string') return null
  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature) return null

  const expected = createHmac('sha256', secret).update(encodedPayload).digest()
  const received = Buffer.from(signature, 'base64url')
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as UploadTokenPayload
    const details = validateDetails(payload)
    if (!details || typeof payload.videoKey !== 'string' || payload.expiresAt < Date.now()) return null
    if (!payload.videoKey.startsWith('clips/')) return null
    return { ...details, videoKey: payload.videoKey, expiresAt: payload.expiresAt }
  } catch {
    return null
  }
}

async function prepareUpload(body: Record<string, unknown>, baseUrl: string, apiKey: string) {
  const details = validateDetails(body)
  if (!details) {
    return NextResponse.json({ error: 'Invalid upload details.' }, { status: 400 })
  }

  const extension = details.contentType === 'video/webm' ? 'webm' : 'mp4'
  const videoKey = `clips/${crypto.randomUUID()}.${extension}`
  const strategyResponse = await fetch(`${baseUrl}/api/storage/buckets/highlights/upload-strategy`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({
      filename: videoKey,
      contentType: details.contentType,
      size: details.fileSize,
    }),
  })

  if (!strategyResponse.ok) {
    return NextResponse.json({ error: 'Upload could not be prepared.' }, { status: 502 })
  }

  const strategy = await strategyResponse.json()
  if (strategy.method !== 'presigned' || !strategy.uploadUrl || !strategy.fields) {
    return NextResponse.json({ error: 'Direct upload is unavailable.' }, { status: 503 })
  }

  const token = signUpload({
    ...details,
    videoKey,
    expiresAt: Date.now() + TOKEN_LIFETIME_MS,
  }, apiKey)

  return NextResponse.json({
    upload: { url: strategy.uploadUrl, fields: strategy.fields },
    token,
  })
}

async function finalizeUpload(body: Record<string, unknown>, baseUrl: string, apiKey: string) {
  const payload = verifyUpload(body.token, apiKey)
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired upload.' }, { status: 400 })
  }

  const confirmResponse = await fetch(
    `${baseUrl}/api/storage/buckets/highlights/objects/${encodeURIComponent(payload.videoKey)}/confirm-upload`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ size: payload.fileSize, contentType: payload.contentType }),
    },
  )
  if (!confirmResponse.ok) {
    return NextResponse.json({ error: 'Uploaded video could not be confirmed.' }, { status: 502 })
  }

  const uploaded = await confirmResponse.json()
  const admin = createAdminClient({ baseUrl, apiKey })
  const { error: insertError } = await admin.database.from('highlights').insert([{
    uploader_name: payload.uploaderName,
    title: payload.title,
    video_url: uploaded.url,
    video_key: uploaded.key,
    file_size: payload.fileSize,
    duration_seconds: Number(payload.duration.toFixed(2)),
    content_type: payload.contentType,
  }])

  if (insertError) {
    await admin.storage.from('highlights').remove(payload.videoKey)
    return NextResponse.json({ error: 'Highlight metadata could not be saved.' }, { status: 502 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function POST(request: Request) {
  const config = getConfig()
  if (!config) {
    return NextResponse.json({ error: 'Upload service is not configured.' }, { status: 500 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  if (body.action === 'prepare') return prepareUpload(body, config.baseUrl, config.apiKey)
  if (body.action === 'finalize') return finalizeUpload(body, config.baseUrl, config.apiKey)
  return NextResponse.json({ error: 'Invalid upload action.' }, { status: 400 })
}
