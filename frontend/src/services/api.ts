import type { AnalysisResponse, StreamCitationPayload } from '../types'

// Local backend
const API_BASE = 'http://localhost:5000/api'

// Render backend
//const API_BASE = 'https://compismart-a1dp.onrender.com/api'

interface AnalyzeParams {
  youtubeUrl: string
  instagramUrl: string
  sessionId: string
}

interface ChatParams {
  message: string
  sessionId: string
}

export async function analyzeComparisons(params: AnalyzeParams): Promise<AnalysisResponse> {
  const response = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    const fallback = await response.text()
    throw new Error(fallback || 'Failed to analyze videos.')
  }

  return response.json() as Promise<AnalysisResponse>
}

export async function* streamChat(
  sessionId: string,
  message: string
): AsyncGenerator<{ type: string; content: string; sources?: any[] }> {
  const res = await fetch(`${API_BASE}/chat/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })

  if (!res.ok) throw new Error('Chat request failed')

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim()
        if (data === '[DONE]') return
        try {
          yield JSON.parse(data)
        } catch {}
      }
    }
  }
}

export async function streamChatResponse(
  params: ChatParams,
  handlers: {
    onToken: (token: string) => void
    onCitations: (payload: StreamCitationPayload) => void
  },
): Promise<void> {
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })

  if (!response.ok || !response.body) {
    throw new Error('Streaming chat is unavailable.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const flushBuffer = (isFinalChunk = false) => {
    while (true) {
      const boundaryIndex = buffer.indexOf('\n\n')

      if (boundaryIndex === -1) {
        break
      }

      const rawEvent = buffer.slice(0, boundaryIndex).trim()
      buffer = buffer.slice(boundaryIndex + 2)

      if (!rawEvent.startsWith('data: ')) {
        continue
      }

      const payload = JSON.parse(rawEvent.slice(6)) as
        | { type: 'token'; value: string }
        | { type: 'citations'; value: string[]; chunks: StreamCitationPayload['chunks'] }
        | { type: 'done' }
        | { type: 'error'; value: string }

      if (payload.type === 'token') {
        handlers.onToken(payload.value)
      }

      if (payload.type === 'citations') {
        handlers.onCitations({ citations: payload.value, chunks: payload.chunks })
      }

      if (payload.type === 'error') {
        throw new Error(payload.value)
      }

      if (payload.type === 'done' && isFinalChunk) {
        return
      }
    }
  }

  while (true) {
    const { value, done } = await reader.read()

    if (done) {
      buffer += decoder.decode()
      flushBuffer(true)
      break
    }

    buffer += decoder.decode(value, { stream: true })
    flushBuffer()
  }
}
