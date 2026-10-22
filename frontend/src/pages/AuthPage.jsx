import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Logo } from '../components/Navbar';

export default function AuthPage({ mode }) {
  const isLogin = mode === 'login';
  const { login, register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isLogin) await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-indigo-700 p-12 text-indigo-50 lg:flex">
        <span className="text-lg font-semibold text-white">PaperTrail AI</span>
        <div>
          <h1 className="text-3xl font-semibold leading-tight text-white">
            Ask your research papers questions.
            <br />
            Get answers that point to the page.
          </h1>
          <p className="mt-4 max-w-md text-indigo-200">
            Upload PDFs into a workspace, and PaperTrail reads them once, then answers questions using only
            what the papers say, citing the paper, section and page for every claim.
          </p>
        </div>
        <span className="text-sm text-indigo-300">GLA University · Mini Project</span>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <Logo />
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">{isLogin ? 'Welcome back' : 'Create your account'}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {isLogin ? 'Log in to your research workspace.' : 'Start organising your literature survey.'}
            </p>
          </div>

          {!isLogin && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Name</span>
              <input className="input" value={form.name} onChange={set('name')} required autoComplete="name" />
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Email</span>
            <input className="input" type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Password</span>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={set('password')}
              required
              minLength={isLogin ? undefined : 8}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
            />
            {!isLogin && <span className="mt-1 block text-xs text-slate-400">At least 8 characters</span>}
          </label>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Please wait…' : isLogin ? 'Log in' : 'Create account'}
          </button>
          <p className="text-center text-sm text-slate-500">
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <Link className="font-medium text-indigo-600 hover:underline" to={isLogin ? '/register' : '/login'}>
              {isLogin ? 'Sign up' : 'Log in'}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
