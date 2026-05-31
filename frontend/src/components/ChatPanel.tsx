import type { ChatMessage } from '../types'

interface ChatPanelProps {
  messages: ChatMessage[]
  draftMessage: string
  isStreaming: boolean
  citations: string[]
  suggestedQuestions: string[]
  onDraftChange: (value: string) => void
  onSend: (message: string) => void
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`rounded-2xl border border-slate-400/15 px-4 py-3 text-sm leading-relaxed ${
      isUser
        ? 'ml-12 bg-blue-950/25 text-slate-100'
        : 'mr-12 bg-slate-900/50 text-slate-100'
    }`}>
      <div>{message.content || (message.role === 'assistant' ? '...' : '')}</div>
      {message.citations?.length ? (
        <div className="mt-3 pt-3 border-t border-slate-700 text-xs text-slate-400 space-y-1">
          <span className="block text-yellow-400 uppercase tracking-wide font-semibold text-xs">Sources:</span>
          <ul className="list-disc list-inside space-y-1">
            {message.citations.map((citation) => (
              <li key={citation} className="text-slate-300">{citation}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export function ChatPanel({
  messages,
  draftMessage,
  isStreaming,
  citations,
  suggestedQuestions,
  onDraftChange,
  onSend,
}: ChatPanelProps) {
  const submit = () => {
    const text = draftMessage.trim()
    if (text) {
      onSend(text)
    }
  }

  return (
    <section className="bg-slate-900/70 backdrop-blur border border-slate-400/15 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs uppercase tracking-widest font-bold text-slate-500">Chat</span>
          <h2 className="text-xl font-bold text-slate-50 mt-1">Ask comparative questions with cited answers</h2>
        </div>
        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-medium ${
          isStreaming
            ? 'text-yellow-300 border-yellow-500/35 bg-yellow-950/30'
            : 'text-slate-300 border-slate-400/20 bg-slate-950/50'
        }`}>
          {isStreaming ? 'Streaming' : 'Ready'}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {suggestedQuestions.map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => onSend(question)}
            className="px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-br from-yellow-400/95 to-orange-500/85 text-slate-900 hover:brightness-110 transition-all"
          >
            {question}
          </button>
        ))}
      </div>

      <div className="grid gap-3 min-h-56 max-h-96 overflow-y-auto">
        {messages.length ? (
          messages.map((message) => <MessageBubble key={`${message.role}-${message.createdAt}`} message={message} />)
        ) : (
          <div className="rounded-lg border border-dashed border-slate-400/15 px-4 py-5 text-slate-400 text-sm">
            Analyze both videos first, then ask about hooks, CTA, storytelling, engagement, or creator details.
          </div>
        )}
      </div>

      <div className="space-y-3">
        <textarea
          value={draftMessage}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="Ask a question about the two videos..."
          rows={3}
          className="w-full px-4 py-2 rounded-lg border border-slate-400/20 bg-slate-950/60 text-slate-100 placeholder-slate-500 focus:border-yellow-500/50 focus:ring-4 focus:ring-yellow-500/10 transition-all resize-none"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">Streaming responses include source citations.</span>
          <button
            type="button"
            onClick={submit}
            disabled={!draftMessage.trim()}
            className="px-4 py-2 rounded-lg font-semibold border border-yellow-500/35 bg-gradient-to-br from-yellow-400/95 to-orange-500/85 text-slate-900 hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          >
            {isStreaming ? 'Streaming...' : 'Send'}
          </button>
        </div>
      </div>

      <aside className="border-t border-slate-400/15 pt-4 space-y-2">
        <h3 className="font-bold text-sm text-slate-100">Latest citations</h3>
        {citations.length ? (
          <ul className="list-disc list-inside space-y-1 text-sm text-slate-300">
            {citations.map((citation) => (
              <li key={citation}>{citation}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No retrieved sources yet. Ask a question to see chunk-level citations.</p>
        )}
      </aside>
    </section>
  )
}
