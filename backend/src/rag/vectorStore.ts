import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers'
import { QdrantVectorStore } from '@langchain/qdrant'
import { QdrantClient } from '@qdrant/js-client-rest'
import { Document } from '@langchain/core/documents'
import { env } from '../config/env'

// ── Qdrant Client Setup ──────────────────────────────────────────
const client = new QdrantClient({ url: env.qdrantUrl || 'http://localhost:6333' })

// ── Local HuggingFace Embeddings (runs on CPU, completely free) ──
const embeddings = new HuggingFaceTransformersEmbeddings({
  model: 'Xenova/all-MiniLM-L6-v2', // Fast, small, great for RAG
})

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 500,
  chunkOverlap: 80,
  separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ', ', ' '],
})

// Qdrant collection names can't have hyphens, so we replace them
function getCollectionName(sessionId: string): string {
  return `session_${sessionId.replace(/-/g, '_')}`
}

// Quick in-memory check so we don't query Qdrant every time
const indexedSessions = new Set<string>()

/**
 * Call this AFTER transcripts are extracted in analyzeService.
 * Splits each transcript into chunks, tags with video metadata, embeds & stores in Qdrant.
 */
export async function indexSession(
  sessionId: string,
  ytTranscript: string,
  igTranscript: string,
  ytMeta: any,
  igMeta: any
): Promise<void> {
  console.log(`[VectorStore] Indexing session ${sessionId} into Qdrant...`)

  const makeDocs = async (
    transcript: string,
    videoId: 'A' | 'B',
    source: 'youtube' | 'instagram',
    meta: any
  ): Promise<Document[]> => {
    if (!transcript || transcript.trim().length === 0) {
      console.warn(`[VectorStore] No transcript for Video ${videoId}, skipping`)
      return []
    }

    const chunks = await splitter.splitText(transcript)

    return chunks.map((text, i) =>
      new Document({
        pageContent: text,
        metadata: {
          video_id: videoId,
          source,
          chunk_index: i,
          total_chunks: chunks.length,
          session_id: sessionId, // Tag with session for filtering
          creator: meta.creatorName,
          views: meta.views,
          likes: meta.likes,
          comments: meta.comments,
          engagement_rate: meta.engagementRate,
          follower_count: meta.followerCount,
          hashtags: (meta.hashtags || []).join(', '),
        },
      })
    )
  }

  const docsA = await makeDocs(ytTranscript, 'A', 'youtube', ytMeta)
  const docsB = await makeDocs(igTranscript, 'B', 'instagram', igMeta)
  const allDocs = [...docsA, ...docsB]

  if (allDocs.length === 0) {
    console.warn('[VectorStore] No documents to index')
    return
  }

  const collectionName = getCollectionName(sessionId)

  try {
    // Create collection and add documents in one shot using LangChain
    await QdrantVectorStore.fromDocuments(allDocs, embeddings, {
      client,
      collectionName,
      // HuggingFace Xenova/all-MiniLM-L6-v2 outputs 384-dimensional vectors.
      // LangChain's Qdrant integration handles collection creation automatically.
    })

    indexedSessions.add(sessionId)
    console.log(
      `[VectorStore] ✅ Indexed ${allDocs.length} chunks in Qdrant collection "${collectionName}" (A:${docsA.length} B:${docsB.length})`
    )
  } catch (err) {
    console.error('[VectorStore] Qdrant indexing error:', err)
    throw err
  }
}

/**
 * Retrieve top-k chunks relevant to the query from Qdrant.
 */
export async function retrieveChunks(
  sessionId: string,
  query: string,
  k = 8
): Promise<Document[]> {
  const collectionName = getCollectionName(sessionId)

  try {
    // Initialize vector store from existing Qdrant collection
    const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
      client,
      collectionName,
    })

    // Perform similarity search
    const results = await vectorStore.similaritySearch(query, k)
    return results
  } catch (err) {
    console.error('[VectorStore] Qdrant retrieval error:', err)
    return []
  }
}

/**
 * Check if a session has been indexed.
 */
export function isIndexed(sessionId: string): boolean {
  return indexedSessions.has(sessionId)
}