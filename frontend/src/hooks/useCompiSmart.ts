import { useEffect, useMemo, useState } from 'react'
import { analyzeComparisons, streamChatResponse } from '../services/api'
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
    () => [
      'Why did Video A get more engagement than Video B?',
      'Compare hooks in the first 5 seconds.',
      'Who is the creator of Video B?',
      'What is the follower count of Video B?',
      'Suggest improvements for Video B based on Video A.',
      'Compare CTAs.',
    ],
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
    const trimmedMessage = message.trim()

    if (!trimmedMessage || isStreaming) {
      return
    }

    setIsStreaming(true)
    setError(null)

    const now = new Date().toISOString()
    const assistantId = `assistant-${now}`

    setMessages((currentMessages) => [
      ...currentMessages,
      { role: 'user', content: trimmedMessage, createdAt: now },
      { role: 'assistant', content: '', createdAt: now },
    ])
    setDraftMessage('')

    let assistantText = ''

    try {
      await streamChatResponse(
        { message: trimmedMessage, sessionId },
        {
          onToken: (token) => {
            assistantText += token
            setMessages((currentMessages) =>
              currentMessages.map((message) =>
                message.role === 'assistant' && message.createdAt === now && message.content === ''
                  ? { ...message, content: assistantText }
                  : message,
              ),
            )
          },
          onCitations: (payload) => {
            setCitations(payload.citations)
            setMessages((currentMessages) =>
              currentMessages.map((message) =>
                message.role === 'assistant' && message.createdAt === now
                  ? { ...message, citations: payload.citations }
                  : message,
              ),
            )
          },
        },
      )
    } catch (caughtError) {
      const fallbackMessage = caughtError instanceof Error ? caughtError.message : 'Streaming failed.'
      setError(fallbackMessage)
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.role === 'assistant' && message.createdAt === now
            ? { ...message, content: fallbackMessage }
            : message,
        ),
      )
    } finally {
      setIsStreaming(false)
    }

    void assistantId
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
