import { Link } from 'react-router-dom';
import { useAuth } from '../auth';

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold text-slate-900">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-sm font-bold text-white">PT</span>
      PaperTrail <span className="text-indigo-600">AI</span>
    </span>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link to="/"><Logo /></Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-slate-500 sm:inline">{user?.name}</span>
          <button className="btn-ghost" onClick={logout}>Log out</button>
        </div>
      </div>
    </header>
  );
}
