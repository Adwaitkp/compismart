import { useState } from 'react'
import type { FormEvent } from 'react'
import { ChatPanel } from '../components/ChatPanel'
import { VideoCard } from '../components/VideoCard'
import { useCompiSmart } from '../hooks/useCompiSmart'

export function HomePage() {
  const {
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
  } = useCompiSmart()

  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [instagramUrl, setInstagramUrl] = useState('')

  const handleAnalyze = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await runAnalysis(youtubeUrl, instagramUrl)
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      {/* Background ambient effects */}
      <div className="fixed top-0 left-0 w-80 h-80 rounded-full blur-3xl opacity-20 -z-10 bg-orange-500/20" />
      <div className="fixed right-0 top-1/3 w-96 h-96 rounded-full blur-3xl opacity-20 -z-10 bg-blue-500/20" />

      <div className="w-full max-w-4xl mx-auto px-4 py-12 space-y-8">
        {/* Hero Section */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-end">
          <div className="lg:col-span-2 space-y-4">
            <span className="text-xs uppercase tracking-widest font-bold text-slate-500">CompiSMART</span>
            <h1 className="text-4xl lg:text-5xl font-bold leading-tight text-slate-50">
              Compare a YouTube video with an Instagram Reel and chat with the content.
            </h1>
            <p className="text-lg text-slate-300 max-w-2xl">
              Built for transcript retrieval, metadata comparison, streaming answers, and source-aware follow-up questions.
            </p>
          </div>
          <div className="space-y-3 bg-slate-900/70 backdrop-blur border border-slate-400/15 rounded-2xl p-5">
            <div>
              <div className="font-bold text-sm text-slate-100">Stack</div>
              <div className="text-xs text-slate-400 mt-1">React, TypeScript, LangChain, Qdrant, Gemini 2.5 Flash</div>
            </div>
            <div className="border-t border-slate-700 pt-3">
              <div className="font-bold text-sm text-slate-100">Output</div>
              <div className="text-xs text-slate-400 mt-1">Engagement rate, hooks, CTA, creator details, citations</div>
            </div>
          </div>
        </section>

        {/* URL Form */}
        <form className="grid grid-cols-1 lg:grid-cols-3 gap-4 bg-slate-900/50 backdrop-blur border border-slate-400/15 rounded-2xl p-5" onSubmit={handleAnalyze}>
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-widest font-semibold text-slate-400">YouTube URL</span>
            <input
              value={youtubeUrl}
              onChange={(event) => setYoutubeUrl(event.target.value)}
              placeholder="Paste a YouTube Short or video URL"
              className="w-full px-4 py-2 rounded-lg border border-slate-400/20 bg-slate-950/60 text-slate-100 placeholder-slate-500 focus:border-yellow-500/50 focus:ring-4 focus:ring-yellow-500/10 transition-all"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-widest font-semibold text-slate-400">Instagram Reel URL</span>
            <input
              value={instagramUrl}
              onChange={(event) => setInstagramUrl(event.target.value)}
              placeholder="Paste an Instagram Reel URL"
              className="w-full px-4 py-2 rounded-lg border border-slate-400/20 bg-slate-950/60 text-slate-100 placeholder-slate-500 focus:border-yellow-500/50 focus:ring-4 focus:ring-yellow-500/10 transition-all"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={isAnalyzing}
              className="w-full px-6 py-2 rounded-lg font-bold border border-yellow-500/35 bg-gradient-to-br from-yellow-400/95 to-orange-500/85 text-slate-900 hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {isAnalyzing ? 'Analyzing...' : 'Analyze'}
            </button>
          </div>
        </form>

        {error ? <div className="p-4 rounded-lg bg-red-950/50 border border-red-500/30 text-red-200">{error}</div> : null}

        {/* Video Comparison Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <VideoCard label="Video A" video={analysis?.youtube ?? null} comparison={analysis?.comparison ?? null} loading={isAnalyzing} />
          <VideoCard label="Video B" video={analysis?.instagram ?? null} comparison={analysis?.comparison ?? null} loading={isAnalyzing} />
        </section>

        {/* Summary Section */}
        {analysis ? (
          <section className="space-y-3 bg-slate-900/70 backdrop-blur border border-slate-400/15 rounded-2xl p-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Engagement winner</span>
                <div className="text-lg font-bold text-slate-100 mt-1">
                  {analysis.comparison.engagementWinner === 'tie' ? 'Tie' : `Video ${analysis.comparison.engagementWinner}`}
                </div>
              </div>
              <div>
                <span className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Hook winner</span>
                <div className="text-lg font-bold text-slate-100 mt-1">
                  {analysis.comparison.hookWinner === 'tie' ? 'Tie' : `Video ${analysis.comparison.hookWinner}`}
                </div>
              </div>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">{analysis.comparison.summary}</p>
          </section>
        ) : null}

        {/* Chat Panel */}
        <ChatPanel
          messages={messages}
          draftMessage={draftMessage}
          isStreaming={isStreaming}
          citations={citations}
          suggestedQuestions={suggestedQuestions}
          onDraftChange={setDraftMessage}
          onSend={sendMessage}
        />
      </div>
    </main>
  )
}
