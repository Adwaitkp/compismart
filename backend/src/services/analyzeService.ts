import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import util from 'util'
import { env } from '../config/env'
import type { VideoMetadata, AnalysisResponse, AnalysisChunk } from '../types'
import { saveAnalysis, getAnalysis } from './sessionStore'
import { indexSession } from '../rag/vectorStore'

const execPromise = util.promisify(exec)

// Format "20260319" → "2026-03-19"
function formatUploadDate(raw: string): string {
  if (!raw || raw.length !== 8) return raw || 'Unknown'
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

async function getInstagramDataFromInstaloader(url: string): Promise<{ views: number; followers: number }> {
  try {
    const scriptPath = path.resolve(process.cwd(), 'ig_meta.py')
    const { stdout } = await execPromise(`python3 "${scriptPath}" "${url}"`, { timeout: 30_000 })
    
    const data = JSON.parse(stdout.trim())
    console.log(`[Instaloader] ✅ Got Views: ${data.views}, Followers: ${data.followers}`)
    
    return { views: data.views || 0, followers: data.followers || 0 }
  } catch (err) {
    console.error('[Instaloader] ❌ Error fetching data:', err)
    return { views: 0, followers: 0 }
  }
}

async function extractMetadata(url: string, source: 'youtube' | 'instagram'): Promise<VideoMetadata> {
  const command = `yt-dlp --dump-json --no-playlist --skip-download --js-runtimes node --remote-components ejs:github "${url}"`

  let stdout: string
  let stderr: string

  try {
    const result = await execPromise(command, { maxBuffer: 1024 * 1024 * 10 }) // 10MB buffer
    stdout = result.stdout
    stderr = result.stderr
  } catch (error: any) {
    console.error(`[yt-dlp error] ${source}:`, error.stderr || error.message)
    throw new Error(`yt-dlp failed for ${source}: ${error.stderr || error.message}`)
  }

  if (!stdout || stdout.trim() === '') {
    console.error(`[yt-dlp] Empty stdout. stderr was:`, stderr)
    throw new Error(`yt-dlp returned no data for ${source}. URL may be private or invalid.`)
  }

  const data = JSON.parse(stdout)

  // ✅ FIX 1: Sanitize all numbers — yt-dlp returns -1 when unavailable
  let views        = Math.max(0, data.view_count          ?? 0)
  const likes        = Math.max(0, data.like_count          ?? 0)  // -1 → 0
  const comments     = Math.max(0, data.comment_count       ?? 0)
  let followerCount = Math.max(0, data.channel_follower_count ?? 0)

  // If it's Instagram, overwrite the null yt-dlp data with Instaloader data
  if (source === 'instagram') {
    const igData = await getInstagramDataFromInstaloader(url)
    views = igData.views
    followerCount = igData.followers
  }

  // ✅ FIX 2: Round duration to integer seconds — yt-dlp returns floats for Instagram
  const durationSeconds = Math.round(data.duration ?? 0)

  // ✅ FIX 3: Format date from "20260319" → "2026-03-19"
  const uploadDate = formatUploadDate(data.upload_date || '')

  // ✅ FIX 4: Use sanitized values for engagement rate, not raw data fields
  const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0

  // ✅ FIX 5: Filter hashtags properly (tags can include non-hashtag items)
  const hashtags = (data.tags || [])
    .filter((t: string) => typeof t === 'string')
    .filter((t: string) => t.startsWith('#'))
    .slice(0, 15)

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
    source,
  }
}

async function getTranscript(url: string, source: 'youtube' | 'instagram'): Promise<string> {
  let timeoutId: NodeJS.Timeout
  
  // Wrap everything in a 180s timeout
  const timeout = new Promise<string>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`[${source}] Transcript timed out after 180s, skipping`)
      resolve('')
    }, 180_000)
  })

  try {
    const result = await Promise.race([fetchTranscript(url, source), timeout])
    clearTimeout(timeoutId) // ✅ FIX: Stop the timer if the transcript finishes first!
    return result
  } catch (err) {
    clearTimeout(timeoutId) // Stop timer on error too
    return ''
  }
}

async function fetchTranscript(url: string, source: 'youtube' | 'instagram'): Promise<string> {
  try {
    if (source === 'youtube') {
      // Use yt-dlp auto-subtitles — fastest, no download needed
      const outPath = `/tmp/transcript_${Date.now()}`

      try {
        const cookiesPath = path.resolve(process.cwd(), 'cookies.txt')
        await execPromise(
          `yt-dlp --write-auto-subs --sub-lang en --sub-format json3 --skip-download --no-playlist --js-runtimes node --remote-components ejs:github --cookies "${cookiesPath}" -o "${outPath}" "${url}"`,
          { timeout: 20_000 }
        )

        // yt-dlp appends .en.json3 to the output path
        const subtitleFile = `${outPath}.en.json3`
        if (fs.existsSync(subtitleFile)) {
          const raw = JSON.parse(fs.readFileSync(subtitleFile, 'utf-8'))
          fs.unlinkSync(subtitleFile)

          const text = (raw.events || [])
            .filter((e: any) => e.segs)
            .flatMap((e: any) => e.segs)
            .map((s: any) => (s.utf8 || '').replace(/\n/g, ' '))
            .join('')
            .trim()

          if (text) {
            console.log(`[YouTube] Got transcript via auto-subs (${text.length} chars)`)
            return text
          }
        }
      } catch (err) {
        console.warn('[YouTube] Auto-subs failed:', err)
      }

      // No subtitles available
      console.warn('[YouTube] No transcript available for this video')
      return ''
    }

    // Instagram — check if whisper is available first
    const whisperCheck = await execPromise('which whisper').catch(() => null)
    if (!whisperCheck) {
      console.warn('[Instagram] Whisper not installed, skipping transcript. Run: pip install openai-whisper --break-system-packages')
      return ''
    }

    return await transcribeWithWhisper(url)
  } catch (error) {
    console.error(`[${source}] Transcript error:`, error)
    return '' // Always return empty string, never throw
  }
}

async function transcribeWithWhisper(url: string): Promise<string> {
  const tmpFile = `/tmp/audio_${Date.now()}.mp3`
  try {
    console.log('[Whisper] Downloading Instagram audio...')
    const cookiesPath = path.resolve(process.cwd(), 'cookies.txt')
    await execPromise(`yt-dlp -x --audio-format mp3 --js-runtimes node --remote-components ejs:github --cookies "${cookiesPath}" -o "${tmpFile}" "${url}"`, { timeout: 120_000 })
    
    console.log('[Whisper] Audio downloaded. Running Whisper AI (this takes a minute)...')
    const whisperBin = process.env.WHISPER_PATH || `${process.env.HOME}/.local/bin/whisper`
    await execPromise(`"${whisperBin}" "${tmpFile}" --model base --language en --output_format json --output_dir /tmp`, { timeout: 180_000 })

    const jsonFile = tmpFile.replace('.mp3', '.json')
    const result = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'))

    ;[tmpFile, jsonFile].forEach(f => fs.existsSync(f) && fs.unlinkSync(f))
    console.log('[Whisper] ✅ Transcription complete!')
    return result.segments.map((s: any) => s.text).join(' ').trim()
  } catch (err) {
    console.error('[Whisper] ❌ Error:', err) // This will tell us exactly why it failed
    ;[tmpFile, tmpFile.replace('.mp3', '.json')].forEach(f => fs.existsSync(f) && fs.unlinkSync(f))
    throw err
  }
}

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
      hookWinner: 'tie',
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

      // ── Proper chunking (using the text splitter) ───────────
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

      // ── Index in vector store for RAG ───────────────────────
      await indexSession(
        sessionId,
        ytTranscript,
        igTranscript,
        youtubeMeta,
        instagramMeta
      )

      console.log(`[Analyze] ✅ Session ${sessionId} ready for AI chat`)
    }
  } catch (err) {
    console.error('[Analyze] Background transcript error:', err)
  }
}