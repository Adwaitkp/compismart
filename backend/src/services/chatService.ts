import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { appendHistory, getAnalysis, getSession } from './sessionStore'
import { retrieveChunks, isIndexed, indexSession } from '../rag/vectorStore'
import { env } from '../config/env'

interface ChatInput {
  message: string
  sessionId: string
}

interface SourceRef {
  video_id: string
  source: string
  chunk_index: number
  preview: string
}

interface StreamEvent {
  type: 'token' | 'sources' | 'error' | 'status'
  content: string
  sources?: SourceRef[]
}

// ── System prompt template ────────────────────────────────────────
const SYSTEM_PROMPT = `You are CompiSMART, an expert social media content analyst AI.
You help creators understand why videos perform differently and give actionable improvement suggestions.

RETRIEVED TRANSCRIPT CHUNKS:
{context}

VIDEO METADATA SUMMARY:
{metadata}

RULES:
1. **Cite sources** — Always mention which video (A or B) you are referencing. Quote the transcript when possible.
2. **Specific numbers** — Quote engagement rates, views, followers when relevant. They are provided above.
3. **Hook analysis** — When asked about hooks, focus on the opening lines of the transcript chunks.
4. **Be actionable** — Give concrete suggestions, not generic advice.
5. **Compare fairly** — Acknowledge strengths and weaknesses of both videos.
6. **Honest** — If the transcript doesn't contain enough info, say so clearly.
7. **Format well** — Use bullet points, numbered lists, and clear structure for readability.`

function formatMetadata(analysis: any): string {
  const a = analysis.youtube.metadata
  const b = analysis.instagram.metadata
  return `
VIDEO A (YOUTUBE):
- Title: ${a.title || 'N/A'}
- Creator: ${a.creatorName} (${a.followerCount.toLocaleString()} followers)
- Views: ${a.views.toLocaleString()} | Likes: ${a.likes.toLocaleString()} | Comments: ${a.comments.toLocaleString()}
- Engagement Rate: ${a.engagementRate.toFixed(2)}%
- Duration: ${a.durationSeconds}s | Uploaded: ${a.uploadDate}
- Hashtags: ${a.hashtags?.join(', ') || 'None'}

VIDEO B (INSTAGRAM):
- Title: ${b.title || 'N/A'}
- Creator: ${b.creatorName} (${b.followerCount.toLocaleString()} followers)
- Views: ${b.views.toLocaleString()} | Likes: ${b.likes.toLocaleString()} | Comments: ${b.comments.toLocaleString()}
- Engagement Rate: ${b.engagementRate.toFixed(2)}%
- Duration: ${b.durationSeconds}s | Uploaded: ${b.uploadDate}
- Hashtags: ${b.hashtags?.join(', ') || 'None'}`.trim()
}

/**
 * Main RAG chat — streams tokens via async generator.
 * Usage: `for await (const event of streamChat(input)) { ... }`
 */
export async function* streamChat(input: ChatInput): AsyncGenerator<StreamEvent> {
  const { message, sessionId } = input
  const analysis = getAnalysis(sessionId)

  if (!analysis) {
    yield { type: 'error', content: 'Session not found. Please analyze videos first.' }
    return
  }

  // Auto-index if needed (handles server restarts)
  if (!(await isIndexed(sessionId))) {
    if (!analysis.youtube.transcript && !analysis.instagram.transcript) {
      yield { type: 'error', content: 'Transcripts are still being processed. Please wait a moment and try again.' }
      return
    }

    yield { type: 'status', content: 'Re-indexing transcripts...' }
    try {
      await indexSession(
        sessionId,
        analysis.youtube.transcript,
        analysis.instagram.transcript,
        analysis.youtube.metadata,
        analysis.instagram.metadata
      )
    } catch (err: any) {
      yield { type: 'error', content: `Indexing failed: ${err.message}` }
      return
    }
  }

  try {
    // 1. Retrieve relevant chunks
    const docs = await retrieveChunks(sessionId, message, 8)

    // 2. Build context string with source tags
    const context = docs
      .map((doc) => {
        const v = doc.metadata.video_id
        const s = doc.metadata.source
        const c = doc.metadata.chunk_index
        return `[Source: Video ${v} (${s}), Chunk ${c}]\n${doc.pageContent}`
      })
      .join('\n\n---\n\n')

    // 3. Build metadata summary
    const metadata = formatMetadata(analysis)

    // 4. Fill system prompt
    const systemContent = SYSTEM_PROMPT
      .replace('{context}', context || 'No transcript chunks available.')
      .replace('{metadata}', metadata)

    // 5. Build message history (last 10 messages for context window)
    const session = getSession(sessionId)
    const historyMessages: BaseMessage[] = (session.history || [])
      .slice(-10)
      .map((msg) =>
        msg.role === 'user'
          ? new HumanMessage(msg.content)
          : new AIMessage(msg.content)
      )

    const messages: BaseMessage[] = [
      new SystemMessage(systemContent),
      ...historyMessages,
      new HumanMessage(message),
    ]

    // 6. Stream from Gemini
    const llm = new ChatGoogleGenerativeAI({
      model: 'gemini-flash-latest',
      apiKey: env.geminiApiKey,
      temperature: 0.3,
      maxOutputTokens: 2048,
      streaming: true,
    })

    let fullResponse = ''
    const stream = await llm.stream(messages)

    for await (const chunk of stream) {
      const token = chunk.content as string
      if (token) {
        fullResponse += token
        yield { type: 'token', content: token }
      }
    }

    // 7. Yield sources after streaming is done
    const uniqueSources: SourceRef[] = [
      ...new Map(
        docs.map((d) => [
          `${d.metadata.video_id}-${d.metadata.chunk_index}`,
          {
            video_id: d.metadata.video_id,
            source: d.metadata.source,
            chunk_index: d.metadata.chunk_index,
            preview: d.pageContent.substring(0, 120) + '...',
          },
        ])
      ).values(),
    ]
    yield { type: 'sources', content: '', sources: uniqueSources }

    // 8. Save to chat history
    appendHistory(sessionId, {
      role: 'user',
      content: message,
      createdAt: new Date().toISOString(),
    })
    appendHistory(sessionId, {
      role: 'assistant',
      content: fullResponse,
      createdAt: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('[Chat] Gemini error:', error)
    yield {
      type: 'error',
      content: error.message || 'Failed to generate response from Gemini.',
    }
  }
}

/**
 * Keep backward compatibility — non-streaming version.
 * Returns full response as a string.
 */
export async function generateChatResponse(input: ChatInput): Promise<{
  answer: string
  citations: string[]
  sources: SourceRef[]
}> {
  let fullAnswer = ''
  const citations: string[] = []
  const sources: SourceRef[] = []

  for await (const event of streamChat(input)) {
    if (event.type === 'token') {
      fullAnswer += event.content
    } else if (event.type === 'sources' && event.sources) {
      sources.push(...event.sources)
      event.sources.forEach((s) => {
        citations.push(`Video ${s.video_id}, Chunk ${s.chunk_index}`)
      })
    } else if (event.type === 'error') {
      fullAnswer += `\n\n❌ ${event.content}`
    }
  }

  return { answer: fullAnswer, citations, sources }
}