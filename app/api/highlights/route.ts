import { createAdminClient } from '@insforge/sdk'
import { NextResponse } from 'next/server'

const MAX_FILE_SIZE = 25 * 1024 * 1024
const MAX_DURATION_SECONDS = 30
const ACCEPTED_TYPES = new Set(['video/mp4', 'video/webm'])

function getAdminClient() {
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL
  const apiKey = process.env.INSFORGE_API_KEY

  if (!baseUrl || !apiKey) return null
  return createAdminClient({ baseUrl, apiKey })
}

export async function POST(request: Request) {
  const admin = getAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Upload service is not configured.' }, { status: 500 })
  }

  const formData = await request.formData()
  const uploaderName = String(formData.get('uploaderName') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const duration = Number(formData.get('duration'))
  const file = formData.get('file')

  if (uploaderName.length < 1 || uploaderName.length > 30 || title.length < 1 || title.length > 80) {
    return NextResponse.json({ error: 'Invalid highlight details.' }, { status: 400 })
  }
  if (!(file instanceof File) || !ACCEPTED_TYPES.has(file.type) || file.size < 1 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Invalid video file.' }, { status: 400 })
  }
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_DURATION_SECONDS) {
    return NextResponse.json({ error: 'Invalid video duration.' }, { status: 400 })
  }

  const extension = file.type === 'video/webm' ? 'webm' : 'mp4'
  const videoKey = `clips/${crypto.randomUUID()}.${extension}`
  const { data: uploaded, error: uploadError } = await admin.storage
    .from('highlights')
    .upload(videoKey, file)

  if (uploadError || !uploaded) {
    return NextResponse.json({ error: 'Video upload failed.' }, { status: 502 })
  }

  const { error: insertError } = await admin.database.from('highlights').insert([{
    uploader_name: uploaderName,
    title,
    video_url: uploaded.url,
    video_key: uploaded.key,
    file_size: file.size,
    duration_seconds: Number(duration.toFixed(2)),
    content_type: file.type,
  }])

  if (insertError) {
    await admin.storage.from('highlights').remove(uploaded.key)
    return NextResponse.json({ error: 'Highlight metadata could not be saved.' }, { status: 502 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
