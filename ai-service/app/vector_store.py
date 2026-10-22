"""Stores each paper's chunks and vectors on disk; builds a FAISS index over the selected papers at query time.

Keeping vectors per paper makes deleting a paper or asking about a subset of papers trivial,
and at our scale (a few thousand chunks per workspace) building a flat index per query takes milliseconds.
"""

import json
import re
import shutil
import threading

import faiss
import numpy as np

from . import config

PAPERS_DIR = config.DATA_DIR / "papers"
PAPERS_DIR.mkdir(parents=True, exist_ok=True)
_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

_cache: dict[str, tuple[np.ndarray, list[dict]]] = {}
_cache_lock = threading.Lock()


def _paper_dir(paper_id: str):
    if not _SAFE_ID.match(paper_id):
        raise ValueError(f"Invalid paper id: {paper_id!r}")
    return PAPERS_DIR / paper_id


def save_paper(paper_id: str, chunks: list[dict], vectors: np.ndarray, info: dict) -> None:
    d = _paper_dir(paper_id)
    d.mkdir(parents=True, exist_ok=True)
    np.save(d / "embeddings.npy", vectors)
    (d / "chunks.json").write_text(json.dumps(chunks, ensure_ascii=False), encoding="utf-8")
    (d / "info.json").write_text(json.dumps(info, ensure_ascii=False), encoding="utf-8")
    with _cache_lock:
        _cache.pop(paper_id, None)


def delete_paper(paper_id: str) -> bool:
    d = _paper_dir(paper_id)
    with _cache_lock:
        _cache.pop(paper_id, None)
    if d.exists():
        shutil.rmtree(d)
        return True
    return False


def has_paper(paper_id: str) -> bool:
    return (_paper_dir(paper_id) / "embeddings.npy").exists()


def _load(paper_id: str):
    with _cache_lock:
        if paper_id in _cache:
            return _cache[paper_id]
    d = _paper_dir(paper_id)
    vectors = np.load(d / "embeddings.npy")
    chunks = json.loads((d / "chunks.json").read_text(encoding="utf-8"))
    with _cache_lock:
        _cache[paper_id] = (vectors, chunks)
    return vectors, chunks


def search(paper_ids: list[str], query_vector: np.ndarray, top_k: int, max_chunks: int) -> list[dict]:
    """Global top-k across the papers, plus the best chunk of every paper that is at least
    somewhat relevant, so questions like "which datasets do these papers use?" cover every paper."""
    all_vectors, meta = [], []
    for pid in paper_ids:
        if not has_paper(pid):
            continue
        vectors, chunks = _load(pid)
        all_vectors.append(vectors)
        meta.extend({**c, "paper_id": pid} for c in chunks)
    if not all_vectors:
        return []

    matrix = np.vstack(all_vectors)
    index = faiss.IndexFlatIP(matrix.shape[1])
    index.add(matrix)
    k = min(len(meta), max(top_k * 4, 50))
    scores, ids = index.search(query_vector.reshape(1, -1), k)
    ranked = [(float(s), int(i)) for s, i in zip(scores[0], ids[0]) if i >= 0]

    chosen = {i for _, i in ranked[:top_k]}
    if len(paper_ids) > 1:
        seen_papers = {meta[i]["paper_id"] for i in chosen}
        for score, i in ranked:
            pid = meta[i]["paper_id"]
            if pid not in seen_papers and score >= config.MIN_SCORE:
                chosen.add(i)
                seen_papers.add(pid)

    results = [{**meta[i], "score": round(s, 4)} for s, i in ranked if i in chosen]
    return results[:max_chunks]
