import type { Request, Response } from 'express'
import { analyzeVideos } from '../services/analyzeService'

export async function analyzeController(req: Request, res: Response): Promise<void> {
  const { youtubeUrl, instagramUrl, sessionId } = req.body as {
    youtubeUrl?: string
    instagramUrl?: string
    sessionId?: string
  }

  if (!youtubeUrl || !instagramUrl) {
    res.status(400).json({
      error: 'Both youtubeUrl and instagramUrl are required.',
    })
    return
  }

  try {
    const analysis = await analyzeVideos({
      youtubeUrl,
      instagramUrl,
      sessionId: sessionId ?? crypto.randomUUID(),
    })

    res.json(analysis)
  } catch (error) {
    console.error('[Controller] Analyze error:', error)
    res.status(500).json({
      error: 'Failed to analyze videos',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
