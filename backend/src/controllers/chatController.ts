import type { Request, Response } from 'express'
import type { ChatRequestBody } from '../types'
import { generateChatResponse } from '../services/chatService'

export async function chatController(req: Request, res: Response): Promise<void> {
  const { message, sessionId } = req.body as ChatRequestBody

  if (!message || !sessionId) {
    res.status(400).json({
      error: 'message and sessionId are required.',
    })
    return
  }

  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  try {
    const response = await generateChatResponse({ message, sessionId }, (token) => {
      res.write(`data: ${JSON.stringify({ type: 'token', value: token })}\n\n`)
    })

    res.write(`data: ${JSON.stringify({ type: 'citations', value: response.citations, chunks: response.chunks })}\n\n`)
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
    res.end()
  } catch {
    res.write(`data: ${JSON.stringify({ type: 'error', value: 'Failed to generate response.' })}\n\n`)
    res.end()
  }
}
