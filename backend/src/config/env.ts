import dotenv from 'dotenv'

dotenv.config()

const parseList = (input?: string, fallback: string[]) => {
  if (!input) return fallback
  return input.split(',').map(s => s.trim()).filter(Boolean)
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigins: parseList(process.env.CORS_ORIGINS, [
    'http://localhost:5173',
    'https://comparesmart.onrender.com',
  ]),
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  qdrantUrl: process.env.QDRANT_URL ?? 'http://localhost:6333',
  qdrantApiKey: process.env.QDRANT_API_KEY ?? '',
  nodeEnv: process.env.NODE_ENV ?? 'development',
} as const
