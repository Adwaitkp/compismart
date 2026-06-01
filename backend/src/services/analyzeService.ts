import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import util from 'util'
import { DeepgramClient } from '@deepgram/sdk'
import type { VideoMetadata, AnalysisResponse, AnalysisChunk } from '../types'
import { saveAnalysis, getAnalysis } from './sessionStore'
import { indexSession } from '../rag/vectorStore'
import { env } from '../config/env'

const execPromise = util.promisify(exec)

function formatUploadDate(raw: string): string {
  if (!raw || raw.length !== 8) return raw || 'Unknown'
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

async function getInstagramDataFromInstaloader(url: string): Promise<{ views: number; followers: number }> {
  try {
    const scriptPath = path.resolve(process.cwd(), 'ig_meta.py')
    const { stdout } = await execPromise(`python3 "${scriptPath}" "${url}"`, { timeout: 30_000 })

    const data = JSON.parse(stdout.trim())
    console.log(`[Instaloader] Got Views: ${data.views}, Followers: ${data.followers}`)

    return { views: data.views || 0, followers: data.followers || 0 }
  } catch (err) {
    console.error('[Instaloader] Error fetching data:', err)
    return { views: 0, followers: 0 }
  }
}

async function extractMetadata(url: string, source: 'youtube' | 'instagram'): Promise<VideoMetadata> {
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
    console.error(`[yt-dlp error] ${source}:`, error.stderr || error.message)
    throw new Error(`yt-dlp failed for ${source}: ${error.stderr || error.message}`)
  }

  if (!stdout || stdout.trim() === '') {
    console.error(`[yt-dlp] Empty stdout. stderr was:`, stderr)
    throw new Error(`yt-dlp returned no data for ${source}. URL may be private or invalid.`)
  }

  const data = JSON.parse(stdout)

  let views = Math.max(0, data.view_count ?? 0)
  const likes = Math.max(0, data.like_count ?? 0)
  const comments = Math.max(0, data.comment_count ?? 0)
  let followerCount = Math.max(0, data.channel_follower_count ?? 0)

  if (source === 'instagram') {
    const igData = await getInstagramDataFromInstaloader(url)
    views = igData.views
    followerCount = igData.followers
  }

  const durationSeconds = Math.round(data.duration ?? 0)
  const uploadDate = formatUploadDate(data.upload_date || '')
  const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0

  let hashtags = (data.tags || [])
    .filter((t: string) => typeof t === 'string' && t.trim() !== '')
    .map((t: string) => (t.startsWith('#') ? t : `#${t}`))

  if (data.description && hashtags.length === 0) {
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
    source,
  }
}

async function getTranscript(url: string, source: 'youtube' | 'instagram'): Promise<string> {
  let timeoutId: NodeJS.Timeout | undefined

  const timeout = new Promise<string>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`[${source}] Transcript timed out after 180s, skipping`)
      resolve('')
    }, 180_000)
  })

  try {
    const result = await Promise.race([fetchTranscript(url, source), timeout])
    if (timeoutId) clearTimeout(timeoutId)
    return result
  } catch {
    if (timeoutId) clearTimeout(timeoutId)
    return ''
  }
}

async function fetchTranscript(url: string, source: 'youtube' | 'instagram'): Promise<string> {
  try {
    if (source === 'youtube') {
      const outPath = `/tmp/transcript_${Date.now()}`
      try {
        const cookiesPath = path.resolve(process.cwd(), 'cookies.txt')
        await execPromise(
          `yt-dlp --write-auto-subs --sub-lang en --sub-format json3 --skip-download --no-playlist --extractor-args "youtube:player_client=android" --cookies "${cookiesPath}" -o "${outPath}" "${url}"`,
          { timeout: 20_000 }
        )

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

      console.warn('[YouTube] No auto-subs. Falling back to Deepgram...')
      return await transcribeWithDeepgram(url)
    }

    return await transcribeWithDeepgram(url)
  } catch (error) {
    console.error(`[${source}] Transcript error:`, error)
    return ''
  }
}

async function transcribeWithDeepgram(url: string): Promise<string> {
  const tmpFile = `/tmp/audio_${Date.now()}.mp3`
  try {
    console.log('[Deepgram] Downloading audio...')
    const cookiesPath = path.resolve(process.cwd(), 'cookies.txt')
    await execPromise(
      `yt-dlp -x --audio-format mp3 --extractor-args "youtube:player_client=android" --cookies "${cookiesPath}" -o "${tmpFile}" "${url}"`,
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

    const transcriptionResult = result as any
    const transcript = transcriptionResult.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
    console.log('[Deepgram] ✅ Transcription complete!')
    return transcript
  } catch (err) {
    console.error('[Deepgram] ❌ Error:', err)
    throw err
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
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

      const ytChunks: AnalysisChunk[] = ytTranscript
        ? (await splitter.splitText(ytTranscript)).map((text, i) => ({
            chunkId: i,
            videoId: 'A' as const,
            source: 'youtube' as const,
            text,
            citations: [`Video A, Chunk ${i}`],
          }))
        : []

      const igChunks: AnalysisChunk[] = igTranscript
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

      await indexSession(sessionId, ytTranscript, igTranscript, youtubeMeta, instagramMeta)
      console.log(`[Analyze] Session ${sessionId} ready for AI chat`)
    }
  } catch (err) {
    console.error('[Analyze] Background transcript error:', err)
  }
}
