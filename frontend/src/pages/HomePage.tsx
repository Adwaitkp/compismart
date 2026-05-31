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
    <main className="min-h-screen bg-[#050505] text-slate-100 antialiased">
      {/* Ambient background effects - deeper glow and pulse */}
      <div className="fixed top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full blur-[120px] opacity-30 -z-10 bg-gradient-to-br from-fuchsia-600 to-orange-500 animate-pulse" />
      <div className="fixed right-[-5%] top-1/3 w-[600px] h-[600px] rounded-full blur-[120px] opacity-20 -z-10 bg-gradient-to-br from-cyan-500 to-blue-600 animate-pulse" />

      <div className="w-full max-w-5xl mx-auto px-4 py-16 space-y-10">
        {/* Hero Section */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-end">
          <div className="lg:col-span-2 space-y-5">
            <span className="text-xs uppercase tracking-[0.2em] font-bold text-fuchsia-400/80">CompiSMART</span>
            <h1 className="text-4xl lg:text-6xl font-extrabold leading-tight bg-gradient-to-r from-white via-slate-200 to-slate-500 bg-clip-text text-transparent">
              Compare videos.<br />Chat with the content.
            </h1>
            <p className="text-lg text-slate-400 max-w-2xl leading-relaxed">
              Built for transcript retrieval, metadata comparison, streaming answers, and source-aware follow-up questions.
            </p>
          </div>
          <div className="space-y-4 bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl shadow-black/50 hover:border-white/20 transition-all duration-300">
            <div>
              <div className="font-bold text-sm text-slate-100">Stack</div>
              <div className="text-xs text-slate-400 mt-1.5 leading-relaxed">React, TypeScript, LangChain, Qdrant, Gemini 2.5 Flash</div>
            </div>
            <div className="border-t border-white/10 pt-4">
              <div className="font-bold text-sm text-slate-100">Output</div>
              <div className="text-xs text-slate-400 mt-1.5 leading-relaxed">Engagement rate, hooks, CTA, creator details, citations</div>
            </div>
          </div>
        </section>

        {/* URL Form */}
        <form className="grid grid-cols-1 lg:grid-cols-3 gap-5 bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl shadow-black/50" onSubmit={handleAnalyze}>
          <label className="space-y-2.5">
            <span className="text-xs uppercase tracking-widest font-semibold text-slate-400">YouTube URL</span>
            <input
              value={youtubeUrl}
              onChange={(event) => setYoutubeUrl(event.target.value)}
              placeholder="Paste a YouTube Short or video URL"
              className="w-full px-4 py-3 rounded-xl border border-white/10 bg-black/40 text-slate-100 placeholder-slate-600 focus:border-fuchsia-500/50 focus:ring-4 focus:ring-fuchsia-500/20 transition-all duration-300 outline-none hover:border-white/20"
            />
          </label>
          <label className="space-y-2.5">
            <span className="text-xs uppercase tracking-widest font-semibold text-slate-400">Instagram Reel URL</span>
            <input
              value={instagramUrl}
              onChange={(event) => setInstagramUrl(event.target.value)}
              placeholder="Paste an Instagram Reel URL"
              className="w-full px-4 py-3 rounded-xl border border-white/10 bg-black/40 text-slate-100 placeholder-slate-600 focus:border-cyan-500/50 focus:ring-4 focus:ring-cyan-500/20 transition-all duration-300 outline-none hover:border-white/20"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={isAnalyzing}
              className="w-full px-6 py-3 rounded-xl font-extrabold border border-orange-400/30 bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 text-white hover:scale-[1.02] hover:shadow-lg hover:shadow-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all duration-300 shadow-md shadow-orange-900/40 tracking-wide"
            >
              {isAnalyzing ? 'Analyzing...' : 'Analyze'}
            </button>
          </div>
        </form>

        {error ? <div className="p-4 rounded-xl bg-red-900/30 backdrop-blur border border-red-500/40 text-red-200 shadow-lg shadow-red-900/20">{error}</div> : null}

        {/* Video Comparison Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <VideoCard label="Video A" video={analysis?.youtube ?? null} comparison={analysis?.comparison ?? null} loading={isAnalyzing} />
          <VideoCard label="Video B" video={analysis?.instagram ?? null} comparison={analysis?.comparison ?? null} loading={isAnalyzing} />
        </section>

        {/* Summary Section */}
        {analysis ? (
          <section className="space-y-4 bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl shadow-black/50 hover:border-white/20 transition-all duration-300">
            <div>
              <span className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Engagement winner</span>
              <div className="text-xl font-extrabold text-slate-100 mt-2">
                {analysis.comparison.engagementWinner === 'tie' ? 'Tie' : `Video ${analysis.comparison.engagementWinner}`}
              </div>
            </div>
            <div className="border-t border-white/10 pt-4">
              <p className="text-slate-300 text-sm leading-relaxed">{analysis.comparison.summary}</p>
            </div>
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