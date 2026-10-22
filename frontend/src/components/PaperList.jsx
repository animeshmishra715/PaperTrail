import { api } from '../api';

const STATUS_STYLE = {
  queued: 'bg-slate-100 text-slate-600',
  processing: 'bg-amber-100 text-amber-700',
  ready: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
};
const STATUS_LABEL = { queued: 'Queued', processing: 'Processing…', ready: 'Ready', failed: 'Failed' };

export default function PaperList({ papers, selected, onToggle, onClearSelection, onChanged, onOpen }) {
  async function remove(paper) {
    if (!confirm(`Remove "${paper.title}" from this workspace?`)) return;
    await api(`/papers/${paper._id}`, { method: 'DELETE' }).catch((e) => alert(e.message));
    onChanged();
  }

  async function reprocess(paper) {
    await api(`/papers/${paper._id}/reprocess`, { method: 'POST' }).catch((e) => alert(e.message));
    onChanged();
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Papers ({papers.length})</h2>
        {selected.size > 0 ? (
          <button className="text-xs text-indigo-600 hover:underline" onClick={onClearSelection}>
            Clear selection ({selected.size})
          </button>
        ) : (
          papers.length > 0 && <span className="text-xs text-slate-400">Tick papers to narrow questions</span>
        )}
      </div>

      {papers.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-400">No papers yet.</p>
      ) : (
        <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
          {papers.map((p) => (
            <li key={p._id} className="flex gap-3 px-4 py-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-indigo-600"
                disabled={p.status !== 'ready'}
                checked={selected.has(p._id)}
                onChange={() => onToggle(p._id)}
                aria-label={`Include ${p.title} in questions`}
              />
              <div className="min-w-0 flex-1">
                <button onClick={() => onOpen(p)} className="block text-left text-sm font-medium leading-snug text-slate-800 hover:text-indigo-700">
                  {p.title}
                </button>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                  {p.status === 'ready' && <span>{p.numPages} pages · {p.numChunks} chunks</span>}
                  <button onClick={() => remove(p)} className="ml-auto hover:text-red-600">Remove</button>
                </div>
                {p.status === 'failed' && (
                  <p className="mt-1 text-xs text-red-600">
                    {p.error}{' '}
                    <button onClick={() => reprocess(p)} className="font-medium underline">Retry</button>
                  </p>
                )}
                {p.status === 'ready' && p.sections?.length > 0 && (
                  <p className="mt-1 truncate text-xs text-slate-400" title={p.sections.join(' · ')}>
                    {p.sections.join(' · ')}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
