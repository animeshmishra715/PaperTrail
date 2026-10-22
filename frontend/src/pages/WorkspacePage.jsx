import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import UploadBox from '../components/UploadBox';
import PaperList from '../components/PaperList';
import AskPanel from '../components/AskPanel';
import PdfViewer from '../components/PdfViewer';

export default function WorkspacePage() {
  const { id } = useParams();
  const [workspace, setWorkspace] = useState(null);
  const [papers, setPapers] = useState([]);
  const [selected, setSelected] = useState(new Set()); // empty = ask the whole workspace
  const [viewing, setViewing] = useState(null); // { paperId, title, page, excerpt }
  const [error, setError] = useState('');

  const loadPapers = useCallback(() => api(`/workspaces/${id}/papers`).then((d) => setPapers(d.papers)), [id]);

  useEffect(() => {
    api(`/workspaces/${id}`).then((d) => setWorkspace(d.workspace)).catch((e) => setError(e.message));
    loadPapers().catch((e) => setError(e.message));
  }, [id, loadPapers]);

  // Poll while anything is still being processed in the background.
  const busy = papers.some((p) => p.status === 'queued' || p.status === 'processing');
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => loadPapers().catch(() => {}), 3000);
    return () => clearInterval(timer);
  }, [busy, loadPapers]);

  function toggle(paperId) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(paperId) ? next.delete(paperId) : next.add(paperId);
      return next;
    });
  }

  if (error) return <p className="mx-auto max-w-7xl p-8 text-red-700">{error}</p>;
  if (!workspace) return <p className="p-8 text-center text-slate-500">Loading…</p>;

  const readyPapers = papers.filter((p) => p.status === 'ready');

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-5">
        <Link to="/" className="text-sm text-slate-500 hover:text-indigo-600">← All workspaces</Link>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{workspace.name}</h1>
        {workspace.description && <p className="text-slate-500">{workspace.description}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <aside className="space-y-4">
          <UploadBox workspaceId={id} onUploaded={(newPapers) => setPapers((p) => [...newPapers, ...p])} />
          <PaperList
            papers={papers}
            selected={selected}
            onToggle={toggle}
            onClearSelection={() => setSelected(new Set())}
            onChanged={loadPapers}
            onOpen={(p) => setViewing({ paperId: p._id, title: p.title, page: 1 })}
          />
        </aside>

        <AskPanel
          workspaceId={id}
          readyPapers={readyPapers}
          selected={selected}
          onOpenSource={(s) =>
            setViewing({ paperId: s.paper, title: s.paperTitle, page: s.pageStart, excerpt: s.text, section: s.section })
          }
        />
      </div>

      {viewing && <PdfViewer {...viewing} onClose={() => setViewing(null)} />}
    </main>
  );
}
