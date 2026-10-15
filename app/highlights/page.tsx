'use client'

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react'
import NavBar from '@/app/components/NavBar'
import { Highlight, insforge } from '@/lib/insforge'

const MAX_FILE_SIZE = 25 * 1024 * 1024
const MAX_DURATION_SECONDS = 30
const PAGE_SIZE = 8
const ACCEPTED_TYPES = ['video/mp4', 'video/webm']

type UploadStep = 'idle' | 'checking' | 'uploading' | 'saving'

function getVideoDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const video = document.createElement('video')
    const objectUrl = URL.createObjectURL(file)

    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const duration = video.duration
      URL.revokeObjectURL(objectUrl)
      if (!Number.isFinite(duration)) {
        reject(new Error('영상 길이를 확인할 수 없습니다.'))
        return
      }
      resolve(duration)
    }
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('영상을 읽을 수 없습니다. MP4 또는 WebM 파일인지 확인해주세요.'))
    }
    video.src = objectUrl
  })
}

function formatFileSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

function formatDuration(seconds: number) {
  const rounded = Math.max(1, Math.round(seconds))
  return `0:${String(rounded).padStart(2, '0')}`
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

function queryHighlights(limit: number) {
  return insforge.database
    .from('highlights')
    .select('id, uploader_name, title, video_url, video_key, file_size, duration_seconds, content_type, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(0, limit - 1)
}

export default function HighlightsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [uploaderName, setUploaderName] = useState('')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [formError, setFormError] = useState('')
  const [uploadStep, setUploadStep] = useState<UploadStep>('idle')

  async function fetchHighlights(limit = PAGE_SIZE) {
    const { data, error, count } = await queryHighlights(limit)

    if (error) {
      setListError('하이라이트를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
    } else {
      setListError('')
      setHighlights((data ?? []) as Highlight[])
      setTotalCount(count ?? 0)
    }
    setListLoading(false)
  }

  useEffect(() => {
    let active = true

    void queryHighlights(PAGE_SIZE).then(({ data, error, count }) => {
      if (!active) return
      if (error) {
        setListError('하이라이트를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
      } else {
        setHighlights((data ?? []) as Highlight[])
        setTotalCount(count ?? 0)
      }
      setListLoading(false)
    })

    return () => { active = false }
  }, [])

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null
    setFormError('')
    setFile(null)
    setDuration(null)

    if (!selectedFile) return
    if (!ACCEPTED_TYPES.includes(selectedFile.type)) {
      setFormError('MP4 또는 WebM 영상만 올릴 수 있습니다.')
      event.target.value = ''
      return
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      setFormError('영상 용량은 25MB 이하여야 합니다.')
      event.target.value = ''
      return
    }

    setUploadStep('checking')
    try {
      const videoDuration = await getVideoDuration(selectedFile)
      if (videoDuration > MAX_DURATION_SECONDS) {
        setFormError('영상 길이는 30초 이하여야 합니다.')
        event.target.value = ''
        return
      }
      setFile(selectedFile)
      setDuration(videoDuration)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '영상을 확인하지 못했습니다.')
      event.target.value = ''
    } finally {
      setUploadStep('idle')
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')

    if (!file || duration === null) {
      setFormError('올릴 영상을 선택해주세요.')
      return
    }

    const cleanName = uploaderName.trim()
    const cleanTitle = title.trim()
    if (!cleanName || !cleanTitle) {
      setFormError('이름과 제목을 입력해주세요.')
      return
    }

    setUploadStep('uploading')
    try {
      const prepareResponse = await fetch('/api/highlights', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'prepare',
          uploaderName: cleanName,
          title: cleanTitle,
          duration: Number(duration.toFixed(2)),
          fileSize: file.size,
          contentType: file.type,
        }),
      })
      if (!prepareResponse.ok) throw new Error('prepare failed')

      const prepared = await prepareResponse.json() as {
        upload: { url: string; fields: Record<string, string> }
        token: string
      }
      const uploadBody = new FormData()
      Object.entries(prepared.upload.fields).forEach(([key, value]) => uploadBody.set(key, value))
      uploadBody.set('file', file)

      const uploadResponse = await fetch(prepared.upload.url, {
        method: 'POST',
        body: uploadBody,
      })
      if (!uploadResponse.ok) throw new Error('storage upload failed')

      setUploadStep('saving')
      const finalizeResponse = await fetch('/api/highlights', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'finalize', token: prepared.token }),
      })
      if (!finalizeResponse.ok) throw new Error('finalize failed')
    } catch {
      setUploadStep('idle')
      setFormError('영상 업로드에 실패했습니다. 잠시 후 다시 시도해주세요.')
      return
    }

    setUploaderName('')
    setTitle('')
    setFile(null)
    setDuration(null)
    setUploadStep('idle')
    if (fileInputRef.current) fileInputRef.current.value = ''
    await fetchHighlights()
  }

  const isUploading = uploadStep === 'uploading' || uploadStep === 'saving'
  const submitLabel = uploadStep === 'uploading'
    ? '영상 올리는 중'
    : uploadStep === 'saving'
      ? '정보 저장 중'
      : '하이라이트 올리기'

  return (
    <main id="main-content" className="highlights-page">
      <NavBar />

      <div className="highlights-shell">
        <header className="highlights-header">
          <div>
            <p className="highlights-kicker">SUNGBOK CLIPS</p>
            <h1>하이라이트</h1>
          </div>
          <dl className="highlights-limits" aria-label="업로드 제한">
            <div><dt>길이</dt><dd>30초</dd></div>
            <div><dt>용량</dt><dd>25MB</dd></div>
          </dl>
        </header>

        <section className="highlights-upload" aria-labelledby="upload-title">
          <div className="highlights-section-heading">
            <h2 id="upload-title">새 영상 올리기</h2>
          </div>

          <form onSubmit={handleSubmit} className="highlights-form">
            <div className="highlights-fields">
              <label>
                <span>올린 사람</span>
                <input
                  value={uploaderName}
                  onChange={(event) => setUploaderName(event.target.value)}
                  maxLength={30}
                  placeholder="이름"
                  disabled={isUploading}
                  required
                />
              </label>
              <label>
                <span>영상 제목</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={80}
                  placeholder="어떤 장면인가요?"
                  disabled={isUploading}
                  required
                />
              </label>
            </div>

            <label className="highlights-file">
              <span className="highlights-file-title">영상 선택</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm"
                onChange={handleFileChange}
                disabled={isUploading}
              />
              <span className="highlights-file-copy">
                {uploadStep === 'checking'
                  ? '영상 길이를 확인하고 있습니다'
                  : file && duration !== null
                    ? `${file.name} / ${formatFileSize(file.size)} / ${formatDuration(duration)}`
                    : 'MP4 또는 WebM 파일을 선택하세요'}
              </span>
            </label>

            {formError && <p className="highlights-error" role="alert">{formError}</p>}

            <button className="highlights-submit" type="submit" disabled={isUploading || uploadStep === 'checking'}>
              {submitLabel}
            </button>
          </form>
        </section>

        <section className="highlights-feed" aria-labelledby="feed-title">
          <div className="highlights-section-heading">
            <h2 id="feed-title">최근 하이라이트</h2>
            <span>{totalCount}개의 장면</span>
          </div>

          {listLoading ? (
            <div className="highlights-grid" aria-label="하이라이트 불러오는 중">
              {[0, 1, 2, 3].map((item) => <div className="highlight-skeleton" key={item} />)}
            </div>
          ) : listError ? (
            <div className="highlights-state">
              <p>{listError}</p>
              <button type="button" onClick={() => void fetchHighlights()}>다시 불러오기</button>
            </div>
          ) : highlights.length === 0 ? (
            <div className="highlights-state">
              <strong>아직 올라온 영상이 없습니다.</strong>
              <p>첫 번째 하이라이트를 남겨보세요.</p>
            </div>
          ) : (
            <>
              <div className="highlights-grid">
                {highlights.map((highlight) => (
                  <article className="highlight-item" key={highlight.id}>
                    <video
                      src={highlight.video_url}
                      controls
                      playsInline
                      preload="metadata"
                      aria-label={`${highlight.title} 영상`}
                    />
                    <div className="highlight-caption">
                      <div>
                        <h3>{highlight.title}</h3>
                        <p>{highlight.uploader_name}</p>
                      </div>
                      <div className="highlight-meta">
                        <span>{formatDuration(Number(highlight.duration_seconds))}</span>
                        <time dateTime={highlight.created_at}>{formatDate(highlight.created_at)}</time>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {highlights.length < totalCount && (
                <button
                  className="highlights-more"
                  type="button"
                  onClick={() => void fetchHighlights(highlights.length + PAGE_SIZE)}
                >
                  더 보기
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  )
}
