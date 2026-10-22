import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api('/workspaces').then((d) => setWorkspaces(d.workspaces)).catch((e) => setError(e.message));
  }, []);

  async function create(e) {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const { workspace } = await api('/workspaces', { method: 'POST', body: { name, description } });
      navigate(`/workspaces/${workspace._id}`);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  }

  async function remove(ws) {
    if (!confirm(`Delete "${ws.name}" and all ${ws.paperCount} paper(s) in it? This cannot be undone.`)) return;
    try {
      await api(`/workspaces/${ws._id}`, { method: 'DELETE' });
      setWorkspaces((list) => list.filter((w) => w._id !== ws._id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">Hi {user?.name?.split(' ')[0]} 👋</h1>
      <p className="mt-1 text-slate-500">Keep one workspace per research topic.</p>

      <form onSubmit={create} className="card mt-6 grid gap-3 p-4 sm:grid-cols-[1fr_2fr_auto]">
        <input className="input" placeholder="Workspace name, e.g. AI Traffic Prediction" value={name}
          onChange={(e) => setName(e.target.value)} required maxLength={100} />
        <input className="input" placeholder="Short description (optional)" value={description}
          onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        <button className="btn-primary" disabled={creating}>{creating ? 'Creating…' : 'New workspace'}</button>
      </form>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <section className="mt-8">
        {workspaces === null ? (
          <p className="text-slate-500">Loading workspaces…</p>
        ) : workspaces.length === 0 ? (
          <div className="card p-10 text-center text-slate-500">
            No workspaces yet. Create one above, then upload your first paper.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((ws) => (
              <div key={ws._id} className="card group flex flex-col p-5 transition hover:border-indigo-300 hover:shadow-md">
                <Link to={`/workspaces/${ws._id}`} className="flex-1">
                  <h2 className="font-semibold text-slate-900 group-hover:text-indigo-700">{ws.name}</h2>
                  {ws.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{ws.description}</p>}
                </Link>
                <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                  <span>{ws.paperCount} paper{ws.paperCount === 1 ? '' : 's'} · updated {new Date(ws.updatedAt).toLocaleDateString()}</span>
                  <button onClick={() => remove(ws)} className="rounded px-2 py-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
