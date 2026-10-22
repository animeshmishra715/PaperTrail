import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

function headers(extra = {}) {
  return config.aiServiceKey ? { 'X-Internal-Key': config.aiServiceKey, ...extra } : extra;
}

async function parseResponse(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    let detail = body.detail;
    if (Array.isArray(detail)) detail = detail.map((d) => d.msg).join(', ');
    const err = new Error(detail || `AI service responded with ${res.status}`);
    err.status = res.status === 422 || res.status === 400 ? 422 : 502;
    err.expose = true;
    throw err;
  }
  return body;
}

async function call(url, options) {
  try {
    return await fetch(url, options);
  } catch (cause) {
    const err = new Error('AI service is not reachable. Is the Python service running?');
    err.status = 503;
    err.expose = true;
    err.cause = cause;
    throw err;
  }
}

export async function processPaperFile(paperId, filePath, originalName) {
  const form = new FormData();
  form.append('paper_id', String(paperId));
  form.append('file', await fs.openAsBlob(filePath, { type: 'application/pdf' }), path.basename(originalName));
  const res = await call(`${config.aiServiceUrl}/papers/process`, {
    method: 'POST',
    headers: headers(),
    body: form,
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  return parseResponse(res);
}

export async function deletePaperVectors(paperId) {
  const res = await call(`${config.aiServiceUrl}/papers/${paperId}`, { method: 'DELETE', headers: headers() });
  return parseResponse(res);
}

export async function askQuestion(question, papers) {
  const res = await call(`${config.aiServiceUrl}/ask`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ question, papers: papers.map((p) => ({ id: String(p._id), title: p.title })) }),
    signal: AbortSignal.timeout(2 * 60 * 1000),
  });
  return parseResponse(res);
}
