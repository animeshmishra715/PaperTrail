import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data"))
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# Shared secret so only the Node backend can call this service. Leave empty to disable.
AI_SERVICE_KEY = os.getenv("AI_SERVICE_KEY", "")

# Chunking (in words). Tune these during evaluation.
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "220"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "40"))

# Retrieval
TOP_K = int(os.getenv("TOP_K", "8"))
MAX_CONTEXT_CHUNKS = int(os.getenv("MAX_CONTEXT_CHUNKS", "14"))
# Cosine similarity below this means "nothing relevant found" and the LLM is not called.
MIN_SCORE = float(os.getenv("MIN_SCORE", "0.15"))

DATA_DIR.mkdir(parents=True, exist_ok=True)
