import type { AnalysisResponse, ChatMessage, SessionState } from '../types'

const sessions = new Map<string, SessionState>()

function createSession(sessionId: string): SessionState {
  return {
    sessionId,
    history: [],
  }
}

export function getSession(sessionId: string): SessionState {
  const existingSession = sessions.get(sessionId)

  if (existingSession) {
    return existingSession
  }

  const newSession = createSession(sessionId)
  sessions.set(sessionId, newSession)

  return newSession
}

export function saveAnalysis(sessionId: string, analysis: AnalysisResponse): void {
  const session = getSession(sessionId)
  session.analysis = analysis
  sessions.set(sessionId, session)
}

export function appendHistory(sessionId: string, message: ChatMessage): void {
  const session = getSession(sessionId)
  session.history = [...session.history, message].slice(-20)
  sessions.set(sessionId, session)
}

export function getAnalysis(sessionId: string): AnalysisResponse | null {
  return sessions.get(sessionId)?.analysis ?? null
}
