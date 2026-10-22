import { useRef, useState } from 'react';
import { api } from '../api';

export default function UploadBox({ workspaceId, onUploaded }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function upload(fileList) {
    const files = [...fileList].filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if (!files.length) return setError('Please choose PDF files.');
    setError('');
    setUploading(true);
    const form = new FormData();
    files.slice(0, 10).forEach((f) => form.append('files', f));
    try {
      const { papers } = await api(`/workspaces/${workspaceId}/papers`, { method: 'POST', form });
      onUploaded(papers);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
        disabled={uploading}
        className={`flex w-full flex-col items-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
          dragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-white hover:border-indigo-400'
        }`}
      >
        <svg className="h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V3m0 0L7.5 7.5M12 3l4.5 4.5M3 15v4.5A1.5 1.5 0 004.5 21h15a1.5 1.5 0 001.5-1.5V15" />
        </svg>
        <span className="mt-2 text-sm font-medium text-slate-700">{uploading ? 'Uploading…' : 'Upload research papers'}</span>
        <span className="text-xs text-slate-400">Drop PDFs here or click to browse · up to 10 at a time</span>
      </button>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => upload(e.target.files)} />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
