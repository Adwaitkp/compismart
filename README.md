# CompiSMART

CompiSMART compares a YouTube video and an Instagram Reel, then lets you chat with the analysis.

## Tech Stack

- Backend: Node.js, TypeScript, Express
- Frontend: React, TypeScript, Vite
- AI: Gemini with LangChain
- Search: Qdrant vector database
- Video data: `yt-dlp` and Instagram metadata extraction

## What Each Part Does

- Backend gets video metadata, transcripts, and AI analysis
- LangChain splits transcript text into chunks and stores them in Qdrant
- Gemini answers questions using the retrieved transcript chunks
- Frontend shows the two video cards, the comparison summary, and the chat panel

## Simple Flow

1. Paste a YouTube URL and an Instagram Reel URL
2. Backend extracts metadata and transcript text
3. LangChain chunks the text and saves embeddings in Qdrant
4. Gemini compares the videos and answers chat questions
5. Frontend displays the results and the chat response

## Run

Start the backend and frontend from their own folders using the scripts in each `package.json`.

## Prerequisites

- Node.js (18+ recommended)
- npm or yarn
- Docker (for running Qdrant locally) or a running Qdrant instance
- `yt-dlp` installed on the system (used to scrape metadata and subtitles)

## Quick Start

1. Run Qdrant locally (recommended):

```bash
docker run -d -p 6333:6333 -v qdrant_storage:/qdrant/storage qdrant/qdrant
```

2. Backend: install and run (from `backend/`)

```bash
cd backend
npm install
npm run dev
```

3. Frontend: install and run (from `frontend/`)

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables (backend)

Create a `.env` file in `backend/` with at least:

```
GEMINI_API_KEY=your_gemini_api_key_here
QDRANT_URL=http://localhost:6333
```

## API

- POST `/api/analyze` — body: `{ youtubeUrl, instagramUrl, sessionId? }`
	- Returns an `AnalysisResponse` object containing `youtube`, `instagram`, and `comparison`.

## How the system works (simple flow)

1. Backend extracts metadata via `yt-dlp` and (optionally) `instaloader` for Instagram stats.
2. Transcripts are fetched from YouTube auto-subs when available and chunked by LangChain.
3. Chunks are embedded using a local Hugging Face embedding model and stored in Qdrant.
4. When the user asks a question, the system retrieves relevant chunks from Qdrant, augments the prompt, and streams answers from Gemini.

## Troubleshooting

- If transcripts are empty: ensure `yt-dlp` can access the video.
- If Qdrant isn't reachable: ensure Docker container is running and `QDRANT_URL` points to the right host/port.
- API errors are logged in the backend console output.

## Notes

- This README is a concise guide. See `backend/` and `frontend/` folders for deeper implementation details.
