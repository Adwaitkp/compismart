import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import util from 'util'
import { google } from 'googleapis'
import { Innertube } from 'youtubei.js'
import { DeepgramClient } from '@deepgram/sdk'
import type { VideoMetadata, AnalysisResponse, AnalysisChunk } from '../types'
import { env } from '../config/env'
import { saveAnalysis, getAnalysis } from './sessionStore'
import { indexSession } from '../rag/vectorStore'

const execPromise = util.promisify(exec)

// ── Helper Functions ──────────────────────────────────────────────

// Extract YouTube Video ID from URL
function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([^&?/]+)/)
  return match ? match[1] : null
}

// Convert YouTube API duration "PT1M30S" to seconds
function parseDuration(iso: string): number {
  if (!iso) return 0
  const match = iso.match(/PT(\d+H)?(\d+M)?(\d+S)?/)
  if (!match) return 0
  const hours = parseInt(match[1] || '0') || 0
  const minutes = parseInt(match[2] || '0') || 0
  const seconds = parseInt(match[3] || '0') || 0
  return hours * 3600 + minutes * 60 + seconds
}

// Format "20260319" → "2026-03-19" (for Instagram)
function formatUploadDate(raw: string): string {
  if (!raw || raw.length !== 8) return raw || 'Unknown'
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

// ── Instagram Metadata (Using yt-dlp + Instaloader) ──────────────

async function getInstagramDataFromInstaloader(url: string): Promise<{ views: number; followers: number }> {
  try {
    const scriptPath = path.resolve(process.cwd(), 'ig_meta.py')
    const { stdout } = await execPromise(`python3 "${scriptPath}" "${url}"`, { timeout: 30_000 })
    
    const data = JSON.parse(stdout.trim())
    console.log(`[Instaloader]  Got Views: ${data.views}, Followers: ${data.followers}`)
    
    return { views: data.views || 0, followers: data.followers || 0 }
  } catch (err) {
    console.error('[Instaloader]  Error fetching data:', err)
    return { views: 0, followers: 0 }
  }
}

// ── Extract Metadata ──────────────────────────────────────────────

async function extractMetadata(url: string, source: 'youtube' | 'instagram'): Promise<VideoMetadata> {
  if (source === 'youtube') {
    // ── OFFICIAL YOUTUBE API (No yt-dlp, never gets blocked) ──────
    const videoId = getYouTubeId(url)
    if (!videoId) throw new Error('Invalid YouTube URL')

    if (!env.youtubeApiKey) {
      throw new Error('YouTube API key not configured. Set YOUTUBE_API_KEY environment variable.')
    }

    const youtube = google.youtube({ version: 'v3', auth: env.youtubeApiKey })

    // Fetch Video Stats & Snippet
    const videoResponse = await youtube.videos.list({
      id: [videoId],
      part: ['snippet', 'statistics', 'contentDetails'],
    })

    const videoData = videoResponse.data.items?.[0]
    if (!videoData) throw new Error('YouTube video not found or is private.')

    // Fetch Channel Stats (for follower count)
    const channelResponse = await youtube.channels.list({
      id: videoData.snippet?.channelId ? [videoData.snippet.channelId] : [],
      part: ['statistics'],
    })
    const channelData = channelResponse.data.items?.[0]

    const views = Number(videoData.statistics?.viewCount || 0)
    const likes = Number(videoData.statistics?.likeCount || 0)
    const comments = Number(videoData.statistics?.commentCount || 0)
    const followerCount = Number(channelData?.statistics?.subscriberCount || 0)
    const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0

    return {
      title: videoData.snippet?.title || '',
      creatorName: videoData.snippet?.channelTitle || '',
      views,
      likes,
      comments,
      followerCount,
      uploadDate: videoData.snippet?.publishedAt || '',
      durationSeconds: parseDuration(videoData.contentDetails?.duration || 'PT0S'),
      hashtags: (videoData.snippet?.tags || []).slice(0, 15).map(t => t.startsWith('#') ? t : `#${t}`),
      engagementRate,
      thumbnailUrl: videoData.snippet?.thumbnails?.maxres?.url || videoData.snippet?.thumbnails?.high?.url || '',
      url,
      source: 'youtube',
    }
  }

  // ── INSTAGRAM (Keep yt-dlp + Instaloader) ──────────────────────
  const cookiePath = path.resolve(process.cwd(), 'cookies.txt')
  const commandArgs = [
    'yt-dlp',
    url,
    '--cookies', cookiePath,
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    '-j',
    '--no-download',
    '--no-check-certificates',
    '--no-warnings',
  ]

  const command = commandArgs.map(arg => `"${arg}"`).join(' ')

  let stdout: string
  let stderr: string

  try {
    const result = await execPromise(command, { maxBuffer: 1024 * 1024 * 10 })
    stdout = result.stdout
    stderr = result.stderr
  } catch (error: any) {
    console.error(`[yt-dlp error] instagram:`, error.stderr || error.message)
    throw new Error(`yt-dlp failed for instagram: ${error.stderr || error.message}`)
  }

  if (!stdout || stdout.trim() === '') {
    throw new Error(`yt-dlp returned no data for instagram. URL may be private or invalid.`)
  }

  const data = JSON.parse(stdout)

  let views        = Math.max(0, data.view_count          ?? 0)
  const likes        = Math.max(0, data.like_count          ?? 0)
  const comments     = Math.max(0, data.comment_count       ?? 0)
  let followerCount = Math.max(0, data.channel_follower_count ?? 0)

  const igData = await getInstagramDataFromInstaloader(url)
  views = igData.views
  followerCount = igData.followers

  const durationSeconds = Math.round(data.duration ?? 0)
  const uploadDate = formatUploadDate(data.upload_date || '')
  const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0

  let hashtags = (data.tags || [])
    .filter((t: string) => typeof t === 'string' && t.trim() !== '')
    .map((t: string) => (t.startsWith('#') ? t : `#${t}`))

  if (hashtags.length === 0 && data.description) {
    const descTags = data.description.match(/#[\w]+/g)
    if (descTags) hashtags = descTags
  }

  hashtags = [...new Set(hashtags)].slice(0, 15)

  return {
    title: data.title || '',
    creatorName: data.uploader || data.channel || '',
    views,
    likes,
    comments,
    followerCount,
    uploadDate,
    durationSeconds,
    hashtags,
    engagementRate,
    thumbnailUrl: data.thumbnail || '',
    url,
    source: 'instagram',
  }
}

// ── Transcription (Deepgram for Instagram, youtubei.js for YT) ────

async function transcribeWithDeepgram(url: string): Promise<string> {
  const tmpFile = `/tmp/audio_${Date.now()}.mp3`
  try {
    console.log('[Deepgram] Downloading Instagram audio...')
    const cookiesPath = path.resolve(process.cwd(), 'cookies.txt')
    await execPromise(
      `yt-dlp -x --audio-format mp3 --js-runtimes node --remote-components ejs:github --cookies "${cookiesPath}" -o "${tmpFile}" "${url}"`,
      { timeout: 120_000 }
    )

    console.log('[Deepgram] Audio downloaded. Sending to Deepgram API...')
    const deepgram = new DeepgramClient({ apiKey: env.deepgramApiKey })

    const result = await deepgram.listen.v1.media.transcribeFile(
      fs.createReadStream(tmpFile),
      {
        model: 'nova-2',
        smart_format: true,
        language: 'en',
      }
    )

    const transcript = 'results' in result
      ? result.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
      : ''
    console.log('[Deepgram]  Transcription complete!')
    return transcript
  } catch (err) {
    console.error('[Deepgram] Error:', err)
    throw err
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
  }
}

async function fetchTranscript(url: string, source: 'youtube' | 'instagram'): Promise<string> {
  try {
    if (source === 'youtube') {
      // ── YOUTUBEI.JS (Native JS, no yt-dlp bot blocks) ───────────
      console.log('[YouTube] Fetching transcript natively via youtubei.js...')
      const videoId = getYouTubeId(url)
      if (!videoId) return ''

      try {
        const youtube = await Innertube.create()
        const video = await youtube.getInfo(videoId)
        const transcriptData = await video.getTranscript()

        const text = transcriptData.transcript.content.body.initial_segments
          .map((seg: any) => seg.snippet.text)
          .join(' ')
          .trim()

        if (text) {
          console.log(`[YouTube] Got transcript natively (${text.length} chars)`)
          return text
        }
      } catch (err) {
        console.warn('[YouTube] Native transcript failed or not available:', err)
      }

      // Return empty instead of falling back to yt-dlp/Deepgram to avoid IP bans
      console.warn('[YouTube] No transcript available for this video.')
      return ''
    }

    // ── INSTAGRAM (Deepgram) ──────────────────────────────────────
    return await transcribeWithDeepgram(url)
  } catch (error) {
    console.error(`[${source}] Transcript error:`, error)
    return ''
  }
}

async function getTranscript(url: string, source: 'youtube' | 'instagram'): Promise<string> {
  let timeoutId: NodeJS.Timeout
  
  const timeout = new Promise<string>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`[${source}] Transcript timed out after 180s, skipping`)
      resolve('')
    }, 180_000)
  })

  try {
    const result = await Promise.race([fetchTranscript(url, source), timeout])
    clearTimeout(timeoutId)
    return result
  } catch (err) {
    clearTimeout(timeoutId)
    return ''
  }
}

// ── Main Analyze Function ─────────────────────────────────────────

export async function analyzeVideos({ youtubeUrl, instagramUrl, sessionId }: {
  youtubeUrl: string
  instagramUrl: string
  sessionId: string
}) {
  console.log('[Analyze] Starting parallel metadata extraction...')

  const [youtubeMetadata, instagramMetadata] = await Promise.all([
    extractMetadata(youtubeUrl, 'youtube'),
    extractMetadata(instagramUrl, 'instagram'),
  ])

  console.log('[Analyze] Metadata done. Starting background transcript extraction...')

  // Fire and forget — never blocks the HTTP response
  extractTranscriptsInBackground(youtubeUrl, instagramUrl, sessionId, youtubeMetadata, instagramMetadata)

  const result: AnalysisResponse = {
    sessionId,
    youtube: {
      videoId: 'A',
      source: 'youtube',
      metadata: youtubeMetadata,
      transcript: '',
      chunks: [],
    },
    instagram: {
      videoId: 'B',
      source: 'instagram',
      metadata: instagramMetadata,
      transcript: '',
      chunks: [],
    },
    comparison: {
      engagementWinner:
        youtubeMetadata.engagementRate > instagramMetadata.engagementRate ? 'A' :
        instagramMetadata.engagementRate > youtubeMetadata.engagementRate ? 'B' : 'tie',
      summary: `Video A: ${youtubeMetadata.engagementRate.toFixed(2)}% | Video B: ${instagramMetadata.engagementRate.toFixed(2)}%`,
    },
  }

  saveAnalysis(sessionId, result)
  return result
}

async function extractTranscriptsInBackground(
  youtubeUrl: string,
  instagramUrl: string,
  sessionId: string,
  youtubeMeta: VideoMetadata,
  instagramMeta: VideoMetadata,
) {
  try {
    const [ytTranscript, igTranscript] = await Promise.all([
      getTranscript(youtubeUrl, 'youtube').catch(() => ''),
      getTranscript(instagramUrl, 'instagram').catch(() => ''),
    ])

    const existing = getAnalysis(sessionId)
    if (existing) {
      existing.youtube.transcript = ytTranscript
      existing.instagram.transcript = igTranscript

      const { createTextSplitter } = await import('../rag/textChunker')
      const splitter = createTextSplitter()

      const ytChunks = ytTranscript
        ? (await splitter.splitText(ytTranscript)).map((text, i) => ({
            chunkId: i,
            videoId: 'A' as const,
            source: 'youtube' as const,
            text,
            citations: [`Video A, Chunk ${i}`],
          }))
        : []

      const igChunks = igTranscript
        ? (await splitter.splitText(igTranscript)).map((text, i) => ({
            chunkId: i,
            videoId: 'B' as const,
            source: 'instagram' as const,
            text,
            citations: [`Video B, Chunk ${i}`],
          }))
        : []

      existing.youtube.chunks = ytChunks
      existing.instagram.chunks = igChunks
      saveAnalysis(sessionId, existing)

      console.log(
        `[Analyze] Transcripts saved to session ${sessionId} (A:${ytChunks.length} chunks, B:${igChunks.length} chunks)`
      )

      await indexSession(
        sessionId,
        ytTranscript,
        igTranscript,
        youtubeMeta,
        instagramMeta
      )

      console.log(`[Analyze]  Session ${sessionId} ready for AI chat`)
    }
  } catch (err) {
    console.error('[Analyze] Background transcript error:', err)
  }
}