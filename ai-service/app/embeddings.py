import threading

import numpy as np

from . import config

_model = None
_lock = threading.Lock()


def get_model():
    global _model
    with _lock:
        if _model is None:
            from sentence_transformers import SentenceTransformer
            _model = SentenceTransformer(config.EMBEDDING_MODEL, device="cpu")
        return _model


def embed(texts: list[str]) -> np.ndarray:
    """Returns L2-normalised float32 vectors, so inner product == cosine similarity."""
    model = get_model()
    with _lock:
        vectors = model.encode(texts, batch_size=32, normalize_embeddings=True,
                               convert_to_numpy=True, show_progress_bar=False)
    return vectors.astype("float32")
