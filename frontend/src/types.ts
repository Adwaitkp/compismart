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

export interface AnalysisChunk {
  chunkId: number
  videoId: 'A' | 'B'
  source: VideoSource
  text: string
  citations: string[]
}

export interface VideoAnalysis {
  videoId: 'A' | 'B'
  source: VideoSource
  metadata: VideoMetadata
  transcript: string
  chunks: AnalysisChunk[]
}

export interface AnalysisResponse {
  sessionId: string
  youtube: VideoAnalysis
  instagram: VideoAnalysis
  comparison: {
    engagementWinner: 'A' | 'B' | 'tie'
    hookWinner: 'A' | 'B' | 'tie'
    summary: string
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  citations?: string[]
  streaming?: boolean
  sources?: any[]
}

export interface StreamCitationPayload {
  citations: string[]
  chunks: AnalysisChunk[]
}
