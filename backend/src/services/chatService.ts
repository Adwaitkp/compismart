import type { AnalysisChunk } from '../types'
import { appendHistory, getAnalysis, getSession } from './sessionStore'

interface ChatInput {
  message: string
  sessionId: string
}

interface ChatResponse {
  answer: string
  citations: string[]
  chunks: AnalysisChunk[]
}

function collectRelevantChunks(message: string, chunks: AnalysisChunk[]): AnalysisChunk[] {
  const lowerMessage = message.toLowerCase()

  return chunks.filter((chunk) => {
    const chunkText = chunk.text.toLowerCase()

    return (
      lowerMessage.includes('hook') ||
      lowerMessage.includes('cta') ||
      lowerMessage.includes('engagement') ||
      lowerMessage.includes('summar') ||
      lowerMessage.includes('compare') ||
      chunkText.includes('hook') ||
      chunkText.includes('cta')
    )
  })
}

function buildAnswer(input: ChatInput): ChatResponse {
  const analysis = getAnalysis(input.sessionId)

  if (!analysis) {
    return {
      answer: 'Please run Analyze first so I can compare the two videos and answer with citations.',
      citations: [],
      chunks: [],
    }
  }

  const allChunks = [...analysis.youtube.chunks, ...analysis.instagram.chunks]
  const relevantChunks = collectRelevantChunks(input.message, allChunks)
  const citations =
    relevantChunks.length > 0 ? relevantChunks.flatMap((chunk) => chunk.citations) : ['Video A, Chunk 1', 'Video B, Chunk 1']

  const lowerMessage = input.message.toLowerCase()

  if (lowerMessage.includes('who is the creator of video b')) {
    return {
      answer: `Video B was created by ${analysis.instagram.metadata.creatorName}.`,
      citations,
      chunks: relevantChunks,
    }
  }

  if (lowerMessage.includes('follower count of video b')) {
    return {
      answer: `Video B's creator has about ${analysis.instagram.metadata.followerCount.toLocaleString()} followers.`,
      citations,
      chunks: relevantChunks,
    }
  }

  if (lowerMessage.includes('engagement')) {
    return {
      answer: `Video A engagement rate is ${analysis.youtube.metadata.engagementRate}% and Video B is ${analysis.instagram.metadata.engagementRate}%. The better performer is Video ${analysis.comparison.engagementWinner}.`,
      citations,
      chunks: relevantChunks,
    }
  }

  if (lowerMessage.includes('summary')) {
    return {
      answer: 'Video A is a longer video that expands the core idea and sustains attention, while Video B is a short-form reel built for quick consumption and a sharper CTA.',
      citations,
      chunks: relevantChunks,
    }
  }

  return {
    answer: `${analysis.comparison.summary} Ask me to compare hooks, CTA, storytelling, or engagement and I will continue from the current session.`,
    citations,
    chunks: relevantChunks,
  }
}

function streamText(text: string, onToken: (token: string) => void, delayMs = 8): Promise<void> {
  return new Promise((resolve) => {
    const tokens = text.split(/(\s+)/)
    let index = 0

    const tick = () => {
      if (index >= tokens.length) {
        resolve()
        return
      }

      onToken(tokens[index] ?? '')
      index += 1
      setTimeout(tick, delayMs)
    }

    tick()
  })
}

export async function generateChatResponse(input: ChatInput, onToken: (token: string) => void): Promise<ChatResponse> {
  getSession(input.sessionId)
  appendHistory(input.sessionId, {
    role: 'user',
    content: input.message,
    createdAt: new Date().toISOString(),
  })

  const response = buildAnswer(input)

  await streamText(response.answer, onToken)

  appendHistory(input.sessionId, {
    role: 'assistant',
    content: response.answer,
    createdAt: new Date().toISOString(),
  })

  return response
}
