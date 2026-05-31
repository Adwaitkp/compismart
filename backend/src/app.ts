import cors from 'cors'
import express from 'express'
import { env } from './config/env'
import routes from './routes'

const app = express()

// CORS: allow only configured origins. If no origin (curl/server-to-server), allow it.
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)
      if (env.corsOrigins.includes(origin)) return callback(null, true)
      return callback(new Error('Not allowed by CORS'))
    },
  })
)
app.use(express.json({ limit: '2mb' }))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'CompiSMART API', env: env.nodeEnv })
})

app.get('/api/proxy-image', async (req, res) => {
  const imageUrl = req.query.url as string
  if (!imageUrl) return res.status(400).send('Missing url')

  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
    })

    if (!response.ok) return res.status(502).send('Failed to fetch image')

    const contentType = response.headers.get('content-type')
    if (contentType) res.set('Content-Type', contentType)
    res.set('Cache-Control', 'public, max-age=3600')

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    res.send(buffer)
  } catch (err) {
    console.error('[Proxy] Image fetch error:', err)
    res.status(500).send('Proxy error')
  }
})

app.use('/api', routes)

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

export default app
