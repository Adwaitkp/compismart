import dotenv from 'dotenv'

dotenv.config()

const parseList = (fallback: string[], input?: string) => {
  if (!input) return fallback
  return input.split(',').map(s => s.trim()).filter(Boolean)
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigins: parseList([
    'http://localhost:5173',
    'compismart-production.up.railway.app',
  ], process.env.CORS_ORIGINS),
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  qdrantUrl: process.env.QDRANT_URL ?? 'http://localhost:6333',
  qdrantApiKey: process.env.QDRANT_API_KEY ?? '',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  deepgramApiKey: process.env.DEEPGRAM_API_KEY || '',
  youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
} as const
