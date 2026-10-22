import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import AnswerText from './AnswerText';

const SUGGESTIONS = [
  'What problem does this paper try to solve?',
  'Which datasets are used?',
  'What evaluation metrics are reported?',
  'What limitations do the authors mention?',
];

function pageLabel(s) {
  return s.pageStart === s.pageEnd ? `p. ${s.pageStart}` : `pp. ${s.pageStart}–${s.pageEnd}`;
}

function SourceList({ sources, onOpen }) {
  const [showAll, setShowAll] = useState(false);
  const cited = sources.filter((s) => s.cited);
  const shown = showAll || cited.length === 0 ? sources : cited;
  if (!sources.length) return null;

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400">
        <span>{showAll || cited.length === 0 ? 'Retrieved passages' : 'Sources'}</span>
        {cited.length > 0 && cited.length < sources.length && (
          <button className="font-normal normal-case tracking-normal text-indigo-600 hover:underline" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show cited only' : `Show all ${sources.length} retrieved`}
          </button>
        )}
      </div>
      <ul className="space-y-1.5">
        {shown.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => onOpen(s)}
              className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-indigo-50"
              title={s.text}
            >
              <span className="mt-0.5 shrink-0 rounded bg-indigo-100 px-1.5 text-xs font-semibold text-indigo-700">{s.id}</span>
              <span className="min-w-0">
                <span className="font-medium text-slate-700">{s.paperTitle}</span>
                <span className="text-slate-400"> · {s.section} · {pageLabel(s)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AskPanel({ workspaceId, readyPapers, selected, onOpenSource }) {
  const [history, setHistory] = useState([]);
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  const readyIds = new Set(readyPapers.map((p) => p._id));
  const scope = [...selected].filter((id) => readyIds.has(id));
  const scopeLabel = scope.length
    ? `${scope.length} selected paper${scope.length === 1 ? '' : 's'}`
    : `all ${readyPapers.length} ready paper${readyPapers.length === 1 ? '' : 's'}`;

  useEffect(() => {
    api(`/workspaces/${workspaceId}/questions`).then((d) => setHistory(d.questions)).catch(() => {});
  }, [workspaceId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [history, pending]);

  async function ask(text) {
    const q = (text ?? question).trim();
    if (!q || pending) return;
    setError('');
    setPending(q);
    setQuestion('');
    try {
      const { question: entry } = await api(`/workspaces/${workspaceId}/ask`, {
        method: 'POST',
        body: { question: q, paperIds: scope },
      });
      setHistory((h) => [...h, entry]);
    } catch (err) {
      setError(err.message);
      setQuestion(q);
    } finally {
      setPending(null);
    }
  }

  async function clearHistory() {
    if (!confirm('Clear all questions in this workspace?')) return;
    await api(`/workspaces/${workspaceId}/questions`, { method: 'DELETE' });
    setHistory([]);
  }

  return (
    <section className="card flex min-h-[70vh] flex-col">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Ask your papers</h2>
          <p className="text-xs text-slate-400">Answers come only from {scopeLabel}, with sources.</p>
        </div>
        {history.length > 0 && <button className="text-xs text-slate-400 hover:text-red-600" onClick={clearHistory}>Clear</button>}
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {history.length === 0 && !pending && (
          <div className="py-10 text-center">
            <p className="text-slate-500">
              {readyPapers.length ? 'Ask anything about your papers. Try one of these:' : 'Upload a paper and wait until it shows Ready.'}
            </p>
            {readyPapers.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => ask(s)} className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:border-indigo-300 hover:text-indigo-700">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {history.map((h) => (
          <div key={h._id} className="space-y-3">
            <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2 text-sm text-white">{h.question}</div>
            <div className={`max-w-[95%] rounded-2xl rounded-bl-sm border px-4 py-3 ${h.insufficientEvidence ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
              {h.insufficientEvidence && (
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Not enough evidence in the papers</p>
              )}
              <AnswerText text={h.answer} sources={h.sources} onCite={onOpenSource} />
              <SourceList sources={h.sources} onOpen={onOpenSource} />
            </div>
          </div>
        ))}

        {pending && (
          <div className="space-y-3">
            <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2 text-sm text-white">{pending}</div>
            <div className="w-fit rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
              <span className="animate-pulse">Searching your papers and writing an answer…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="border-t border-slate-100 p-4">
        {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <textarea
            className="input min-h-[44px] resize-none"
            rows={1}
            placeholder={readyPapers.length ? 'e.g. Which datasets do these papers use?' : 'No ready papers yet'}
            value={question}
            disabled={!readyPapers.length}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
          />
          <button className="btn-primary" disabled={!question.trim() || !!pending || !readyPapers.length}>Ask</button>
        </div>
        <p className="mt-2 text-xs text-slate-400">AI answers can still be wrong. Click a source to check it in the original paper.</p>
      </form>
    </section>
  );
}
