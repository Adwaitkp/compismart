import { useEffect, useMemo, useState } from 'react'
import { analyzeComparisons, streamChat } from '../services/api'
import type { AnalysisResponse, ChatMessage } from '../types'

const STORAGE_KEY = 'compismart-session-id'

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `session-${Date.now()}`
}

export function useCompiSmart() {
  const [sessionId, setSessionId] = useState(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored ?? createSessionId()
  })
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draftMessage, setDraftMessage] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [citations, setCitations] = useState<string[]>([])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, sessionId)
  }, [sessionId])

  const suggestedQuestions = useMemo(
    () => [],
    [],
  )

  const runAnalysis = async (youtubeUrl: string, instagramUrl: string) => {
    setIsAnalyzing(true)
    setError(null)

    try {
      const result = await analyzeComparisons({ youtubeUrl, instagramUrl, sessionId })
      setAnalysis(result)
      setCitations([])
      setMessages([
        {
          role: 'assistant',
          content: 'Analysis complete. Ask a question or use one of the quick prompts below.',
          createdAt: new Date().toISOString(),
        },
      ])
      setSessionId(result.sessionId)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to analyze the videos.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const sendMessage = async (message: string) => {
    const text = message.trim()
    if (!text || isStreaming) return

    // Add user message
    setMessages((prev) => [...prev, { role: 'user', content: text, createdAt: new Date().toISOString() }])
    // Add empty assistant message (will be filled by stream)
    setMessages((prev) => [...prev, { role: 'assistant', content: '', streaming: true, createdAt: new Date().toISOString() }])
    setDraftMessage('')
    setIsStreaming(true)

    let fullContent = ''
    let sources: any[] = []
    let sourceCitations: string[] = []

    try {
      for await (const event of streamChat(sessionId, text)) {
        if (event.type === 'token') {
          fullContent += event.content
          // Update last message
          setMessages((prev) => {
            const updated = [...prev]
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              content: fullContent,
            }
            return updated
          })
        } else if (event.type === 'sources') {
          sources = event.sources || []
          // Convert sources to citations
          sourceCitations = sources.map((s) => `Video ${s.video_id}, Chunk ${s.chunk_index}`)
          // Attach sources and citations to last message
          setMessages((prev) => {
            const updated = [...prev]
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              sources,
              citations: sourceCitations,
              streaming: false,
            }
            return updated
          })
          setCitations(sourceCitations)
        } else if (event.type === 'error') {
          fullContent += `\n\n${event.content}`
        }
      }
    } catch (err: any) {
      fullContent += `\n\nConnection error: ${err.message}`
    }

    // Final update
    setMessages((prev) => {
      const updated = [...prev]
      updated[updated.length - 1] = {
        ...updated[updated.length - 1],
        content: fullContent,
        sources,
        citations: sourceCitations,
        streaming: false,
      }
      return updated
    })
    setIsStreaming(false)
  }

  return {
    analysis,
    citations,
    draftMessage,
    error,
    isAnalyzing,
    isStreaming,
    messages,
    runAnalysis,
    sendMessage,
    setDraftMessage,
    suggestedQuestions,
    sessionId,
  }
}
