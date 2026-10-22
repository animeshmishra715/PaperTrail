import { useEffect, useState } from 'react';
import { fetchPaperPdfUrl } from '../api';

// Opens the original PDF at the cited page, next to the exact passage the answer used.
export default function PdfViewer({ paperId, title, page = 1, excerpt, section, onClose }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let objectUrl;
    fetchPaperPdfUrl(paperId)
      .then((u) => setUrl((objectUrl = u)))
      .catch((e) => setError(e.message));
    return () => objectUrl && URL.revokeObjectURL(objectUrl);
  }, [paperId]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex bg-slate-900/50 p-4" onClick={onClose}>
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{title}</p>
            <p className="text-xs text-slate-500">{section ? `${section} · ` : ''}page {page}</p>
          </div>
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
        {excerpt && (
          <div className="max-h-40 overflow-y-auto border-b border-slate-200 bg-amber-50 px-4 py-3 text-sm text-slate-700">
            <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-amber-700">Passage used</span>
            {excerpt}
          </div>
        )}
        <div className="flex-1 bg-slate-100">
          {error ? (
            <p className="p-6 text-red-600">{error}</p>
          ) : url ? (
            <iframe key={page} title={title} src={`${url}#page=${page}`} className="h-full w-full" />
          ) : (
            <p className="p-6 text-slate-500">Loading PDF…</p>
          )}
        </div>
      </div>
    </div>
  );
}
