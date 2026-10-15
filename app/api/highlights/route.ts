import { createAdminClient } from '@insforge/sdk'
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

const MAX_FILE_SIZE = 50 * 1024 * 1024
const MAX_DURATION_SECONDS = 60
const TOKEN_LIFETIME_MS = 10 * 60 * 1000
const ACCEPTED_TYPES = new Set(['video/mp4', 'video/webm'])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface UploadDetails {
  uploaderName: string
  title: string
  duration: number
  fileSize: number
  contentType: string
}

interface UploadTokenPayload extends UploadDetails {
  videoKey: string
  passwordHash: string
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

function validatePassword(value: unknown) {
  return typeof value === 'string' && value.length >= 4 && value.length <= 64
}

function derivePassword(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}

async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const hash = await derivePassword(password, salt)
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, saltValue, hashValue] = storedHash.split('$')
  if (algorithm !== 'scrypt' || !saltValue || !hashValue) return false

  try {
    const expected = Buffer.from(hashValue, 'base64url')
    const actual = await derivePassword(password, Buffer.from(saltValue, 'base64url'))
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
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
    if (!payload.videoKey.startsWith('clips/') || typeof payload.passwordHash !== 'string') return null
    return { ...details, videoKey: payload.videoKey, passwordHash: payload.passwordHash, expiresAt: payload.expiresAt }
  } catch {
    return null
  }
}

async function prepareUpload(body: Record<string, unknown>, baseUrl: string, apiKey: string) {
  const details = validateDetails(body)
  if (!details || !validatePassword(body.password)) {
    return NextResponse.json({ error: '업로드 정보를 확인해주세요.' }, { status: 400 })
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
    return NextResponse.json({ error: '업로드를 준비하지 못했습니다.' }, { status: 502 })
  }

  const strategy = await strategyResponse.json()
  if (strategy.method !== 'presigned' || !strategy.uploadUrl || !strategy.fields) {
    return NextResponse.json({ error: '직접 업로드를 사용할 수 없습니다.' }, { status: 503 })
  }

  const token = signUpload({
    ...details,
    videoKey,
    passwordHash: await hashPassword(body.password as string),
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
    return NextResponse.json({ error: '유효하지 않거나 만료된 업로드입니다.' }, { status: 400 })
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
    return NextResponse.json({ error: '업로드된 영상을 확인하지 못했습니다.' }, { status: 502 })
  }

  const uploaded = await confirmResponse.json()
  const highlightId = crypto.randomUUID()
  const admin = createAdminClient({ baseUrl, apiKey })
  const { error: insertError } = await admin.database.from('highlights').insert([{
    id: highlightId,
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
    return NextResponse.json({ error: '하이라이트 정보를 저장하지 못했습니다.' }, { status: 502 })
  }

  const { error: passwordError } = await admin.database.from('highlight_passwords').insert([{
    highlight_id: highlightId,
    password_hash: payload.passwordHash,
  }])

  if (passwordError) {
    await admin.database.from('highlights').delete().eq('id', highlightId)
    await admin.storage.from('highlights').remove(payload.videoKey)
    return NextResponse.json({ error: '하이라이트 비밀번호를 저장하지 못했습니다.' }, { status: 502 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}

async function getAuthorizedHighlight(body: Record<string, unknown>, baseUrl: string, apiKey: string) {
  const id = String(body.id ?? '')
  const password = body.password
  if (!UUID_PATTERN.test(id) || !validatePassword(password)) return null

  const admin = createAdminClient({ baseUrl, apiKey })
  const [{ data: secret }, { data: highlight }] = await Promise.all([
    admin.database.from('highlight_passwords').select('password_hash').eq('highlight_id', id).maybeSingle(),
    admin.database.from('highlights').select('id, video_key').eq('id', id).maybeSingle(),
  ])

  if (!secret || !highlight || !await verifyPassword(password as string, secret.password_hash as string)) return null
  return { admin, id, videoKey: highlight.video_key as string }
}

export async function POST(request: Request) {
  const config = getConfig()
  if (!config) {
    return NextResponse.json({ error: '업로드 서비스가 설정되지 않았습니다.' }, { status: 500 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  if (body.action === 'prepare') return prepareUpload(body, config.baseUrl, config.apiKey)
  if (body.action === 'finalize') return finalizeUpload(body, config.baseUrl, config.apiKey)
  return NextResponse.json({ error: '잘못된 업로드 요청입니다.' }, { status: 400 })
}

export async function PATCH(request: Request) {
  const config = getConfig()
  if (!config) return NextResponse.json({ error: '서비스가 설정되지 않았습니다.' }, { status: 500 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const uploaderName = String(body.uploaderName ?? '').trim()
  const title = String(body.title ?? '').trim()
  if (uploaderName.length < 1 || uploaderName.length > 30 || title.length < 1 || title.length > 80) {
    return NextResponse.json({ error: '이름과 제목을 확인해주세요.' }, { status: 400 })
  }

  const authorized = await getAuthorizedHighlight(body, config.baseUrl, config.apiKey)
  if (!authorized) return NextResponse.json({ error: '비밀번호가 맞지 않습니다.' }, { status: 403 })

  const { error } = await authorized.admin.database
    .from('highlights')
    .update({ uploader_name: uploaderName, title })
    .eq('id', authorized.id)

  if (error) return NextResponse.json({ error: '하이라이트를 수정하지 못했습니다.' }, { status: 502 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const config = getConfig()
  if (!config) return NextResponse.json({ error: '서비스가 설정되지 않았습니다.' }, { status: 500 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const authorized = await getAuthorizedHighlight(body, config.baseUrl, config.apiKey)
  if (!authorized) return NextResponse.json({ error: '비밀번호가 맞지 않습니다.' }, { status: 403 })

  const { error } = await authorized.admin.database.from('highlights').delete().eq('id', authorized.id)
  if (error) return NextResponse.json({ error: '하이라이트를 삭제하지 못했습니다.' }, { status: 502 })

  await authorized.admin.storage.from('highlights').remove(authorized.videoKey)
  return NextResponse.json({ ok: true })
}
