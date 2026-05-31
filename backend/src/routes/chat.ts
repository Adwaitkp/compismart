import { Router, Request, Response } from 'express'
import { streamChat } from '../services/chatService'

const router = Router()

router.post('/:sessionId', async (req: Request<{ sessionId: string }>, res: Response) => {
  const { sessionId } = req.params
  const { message } = req.body

  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message is required' })
  }

  // ── SSE headers ─────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  try {
    for await (const event of streamChat({ message, sessionId })) {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }
    res.write('data: [DONE]\n\n')
  } catch (err: any) {
    res.write(
      `data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`
    )
  } finally {
    res.end()
  }
})

// ── Get chat history ──────────────────────────────────────────────
router.get('/:sessionId/history', (req: Request, res: Response) => {
  const { getSession } = require('../services/sessionStore')
  const session = getSession(req.params.sessionId)
  res.json({ history: session?.history || [] })
})

export default router
