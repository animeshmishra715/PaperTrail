const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'papertrail_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch {
    throw new Error('Cannot reach the server. Is the backend running?');
  }
  if (res.status === 401 && token) {
    tokenStore.clear();
    window.dispatchEvent(new Event('papertrail:logout'));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/** Downloads a paper's PDF with the auth header and returns an object URL for an <iframe>. */
export async function fetchPaperPdfUrl(paperId) {
  const res = await fetch(`${BASE}/papers/${paperId}/file`, {
    headers: { Authorization: `Bearer ${tokenStore.get()}` },
  });
  if (!res.ok) throw new Error('Could not load the PDF');
  return URL.createObjectURL(await res.blob());
}
