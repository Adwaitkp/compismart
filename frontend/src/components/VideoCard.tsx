import { useState, useEffect } from 'react'
import type { AnalysisResponse, VideoAnalysis } from '../types'

interface VideoCardProps {
  label: string
  video: VideoAnalysis | null
  comparison: AnalysisResponse['comparison'] | null
  loading?: boolean
}

// FIX 1: Use Math.floor throughout — yt-dlp returns floats for Instagram duration
function formatDuration(durationSeconds: number): string {
  const total = Math.floor(durationSeconds)        // 62.53 → 62
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = Math.floor(total % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`      // "1:02" not "1:2.53"
}

// FIX 2: Clamp negative values — yt-dlp returns -1 when data is unavailable
function formatCompactNumber(value: number): string {
  const n = Math.max(0, value)                     // -1 → 0
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://compismart-production.up.railway.app/api'

function getThumbnailUrl(thumbnailUrl: string, source: string): string {
  if (!thumbnailUrl) return '' // Don't proxy empty URLs
  
  if (source === 'instagram') {
    return `${API_BASE}/proxy-image?url=${encodeURIComponent(thumbnailUrl)}`
  }
  
  return thumbnailUrl
}

export function VideoCard({ label, video, comparison, loading = false }: VideoCardProps) {
  const metadata = video?.metadata
  const [thumbError, setThumbError] = useState(false)

  // Reset error state when a new video is analyzed
  useEffect(() => {
    setThumbError(false)
  }, [metadata?.thumbnailUrl])

  return (
    <article className="bg-slate-900/70 backdrop-blur border border-slate-400/15 rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 flex-1">
          <span className="text-xs uppercase tracking-widest font-bold text-slate-500">{label}</span>
          <h2 className="text-xl font-bold text-slate-50 line-clamp-2">
            {metadata?.title ?? (loading ? 'Analyzing...' : 'Waiting for analysis')}
          </h2>
        </div>
        {metadata ? (
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-400/20 text-xs font-medium bg-slate-950/50 text-slate-300 whitespace-nowrap">
            {metadata.source}
          </span>
        ) : null}
      </div>

      <div className="rounded-xl overflow-hidden border border-slate-400/10">
        {metadata ? (
          thumbError ? (
            <div className="w-full aspect-video bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center text-slate-400 text-sm">
              Thumbnail unavailable
            </div>
          ) : (
            <img
              className="w-full h-auto aspect-video object-cover"
              src={getThumbnailUrl(metadata.thumbnailUrl, metadata.source)}
              alt={metadata.title}
              onError={() => setThumbError(true)}
            />
          )
        ) : (
          <div className="w-full aspect-video bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center text-slate-400 text-sm">
            {loading ? 'Reading metadata' : 'Add a URL and analyze'}
          </div>
        )}
      </div>

      {metadata ? (
        <>
          <dl className="grid grid-cols-2 gap-3">
            {[
              { label: 'Creator',      value: metadata.creatorName || 'Unknown' },
              { label: 'Views',        value: formatCompactNumber(metadata.views) },
              { label: 'Likes',        value: formatCompactNumber(metadata.likes) },
              { label: 'Comments',     value: formatCompactNumber(metadata.comments) },
              { label: 'Followers',    value: formatCompactNumber(metadata.followerCount) },
              { label: 'Duration',     value: formatDuration(metadata.durationSeconds) },
              { label: 'Upload Date',  value: metadata.uploadDate || 'Unknown' },
              { label: 'Hashtags',     value: metadata.hashtags.slice(0, 3).join(' ') || 'None' },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg px-3 py-2 bg-slate-950/40 border border-slate-400/10">
                <dt className="text-xs uppercase tracking-widest text-slate-500 font-semibold">{label}</dt>
                <dd className="text-sm text-slate-200 font-medium mt-1 break-words">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex items-start justify-between gap-3 pt-2 border-t border-slate-700">
            <div>
              <span className="text-xs uppercase tracking-widest text-slate-500 font-semibold block mb-1">
                Engagement Rate
              </span>
              <div className="text-2xl font-bold text-yellow-400">
                {metadata.engagementRate.toFixed(2)}%
              </div>
            </div>
            {/* FIX 4: Guard against video being null before accessing video.videoId */}
            <p className="text-xs text-slate-400 text-right">
              {video && comparison?.engagementWinner === video.videoId
                ? 'Highest engagement'
                : 'Compare against opposite card'}
            </p>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-400/15 px-4 py-5 text-sm text-slate-400">
          {loading
            ? 'Scraping metadata, transcript, and comparison signals...'
            : 'This card will display source details, engagement rate, and transcript-driven signals after analysis.'}
        </div>
      )}
    </article>
  )
}