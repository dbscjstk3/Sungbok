import { createClient } from '@insforge/sdk'

export const insforge = createClient({
  baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
  anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY!,
})

export interface Player {
  id: string
  real_name: string
  summoner_name: string | null
  created_at: string
}

export interface Highlight {
  id: string
  uploader_name: string
  title: string
  video_url: string
  video_key: string
  file_size: number
  duration_seconds: number
  content_type: 'video/mp4' | 'video/webm'
  created_at: string
}
