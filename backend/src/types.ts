export type VideoSource = 'youtube' | 'instagram'

export interface VideoMetadata {
  title: string
  creatorName: string
  views: number
  likes: number
  comments: number
  followerCount: number
  uploadDate: string
  durationSeconds: number
  hashtags: string[]
  engagementRate: number
  thumbnailUrl: string
  url: string
  source: VideoSource
}

export interface VideoAnalysis {
  videoId: 'A' | 'B'
  source: VideoSource
  metadata: VideoMetadata
  transcript: string
  chunks: AnalysisChunk[]
}

export interface AnalysisChunk {
  chunkId: number
  videoId: 'A' | 'B'
  source: VideoSource
  text: string
  citations: string[]
}

export interface AnalysisResponse {
  sessionId: string
  youtube: VideoAnalysis
  instagram: VideoAnalysis
  comparison: {
    engagementWinner: 'A' | 'B' | 'tie'
    summary: string
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface SessionState {
  sessionId: string
  analysis?: AnalysisResponse
  history: ChatMessage[]
}

export interface ChatRequestBody {
  message: string
  sessionId: string
}
