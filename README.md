# PaperTrail AI — Phase 1

An AI-powered research workspace. **Phase 1 flow:**
Log in → Upload a research paper → Process its text → Generate embeddings → Store vectors → Ask questions → Get AI answers with source citations (paper, section, page).

```
React + Tailwind (5173)  ──REST──▶  Node + Express (5000)  ──REST──▶  Python + FastAPI (8000)
   login, workspaces,               auth (JWT), MongoDB Atlas,          PyMuPDF → clean → sections → chunks
   upload, chat, PDF viewer         file uploads, job queue,            Sentence-Transformers → FAISS
                                    question history                    RAG prompt → Gemini → citations
```

| Folder | Owner | What it does |
|---|---|---|
| `frontend/` | Ananya | React + Tailwind UI: login/register, dashboard, workspace page, upload, "Ask your papers" chat, PDF viewer that opens at the cited page |
| `backend/` | Aryan | Express REST API, JWT auth, MongoDB (users, workspaces, papers, questions), PDF upload, background processing queue |
| `ai-service/` | Animesh | FastAPI service: PDF extraction, cleaning, section detection, chunking, embeddings, FAISS search, Gemini RAG with citations |

---

### Prerequisites
- Node.js 20.16+ and Python 3.10–3.12
- A MongoDB Atlas cluster (free tier), or MongoDB running locally
- A Gemini API key from https://aistudio.google.com/apikey (free)

### 1. AI service (Python)
```bash
cd ai-service
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env          # macOS/Linux: cp .env.example .env
```
Edit `ai-service/.env`: set `GEMINI_API_KEY` and an `AI_SERVICE_KEY` (any random string).
```bash
uvicorn app.main:app --port 8000 --reload
```
The first start downloads the embedding model (~90 MB). Check http://127.0.0.1:8000/health.

### 2. Backend (Node)
```bash
cd backend
npm install
copy .env.example .env
```
Edit `backend/.env`: set `MONGODB_URI` (Atlas → Connect → Drivers), `JWT_SECRET`, and the **same** `AI_SERVICE_KEY` as the AI service.
```bash
npm run dev
```
Check http://localhost:5000/api/health, which should show `{"api":"up","db":"up","ai":"up"}`.

### 3. Frontend (React)
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173, create an account, create a workspace, upload a PDF, wait for **Ready**, and ask a question.

---

## How the AI pipeline works (`ai-service/app/`)

| Step | File | Details |
|---|---|---|
| Text extraction | `pdf_processing.py` | PyMuPDF reads every line with its page number, font size and bold flag |
| Cleaning | `pdf_processing.py` | Removes page numbers and running headers/footers (lines repeated on ≥40% of pages), joins hyphenated words |
| Section detection | `pdf_processing.py` | Rule-based: known headings (Abstract, Introduction, Methodology, Results…), numbered headings ("3 Proposed Method"), and larger-font headings. Content after **References** is not indexed |
| Chunking | `pdf_processing.py` | 220-word chunks with 40-word overlap inside each section; every chunk keeps its section and page range |
| Embeddings | `embeddings.py` | `all-MiniLM-L6-v2` (384-dim, normalised, so inner product = cosine similarity) |
| Vector store | `vector_store.py` | Vectors are saved per paper (`data/papers/<id>/`). At question time a FAISS `IndexFlatIP` is built over the selected papers, so you can ask about one paper, a selection, or the whole workspace. The best chunk of each relevant paper is always included, so cross-paper questions cover every paper |
| Answering | `rag.py` | If the best match scores below `MIN_SCORE`, the system says nothing relevant was found **without calling the LLM**. Otherwise Gemini gets numbered excerpts `[S1]…[Sn]` and strict rules: answer only from the excerpts, cite every claim, and reply `NOT_ENOUGH_EVIDENCE` when the excerpts don't answer the question. Citations to sources that don't exist are removed |

Scanned (image-only) PDFs are rejected with a clear message, because OCR is out of scope.

---

## API contract

All backend routes except `/auth/register`, `/auth/login` and `/health` need `Authorization: Bearer <token>`.

**Backend (Express, `/api`)**

| Method | Route | Body / notes |
|---|---|---|
| POST | `/auth/register` | `{name, email, password}` → `{token, user}` |
| POST | `/auth/login` | `{email, password}` → `{token, user}` |
| GET | `/auth/me` | → `{user}` |
| GET / POST | `/workspaces` | POST `{name, description?}` |
| GET / PATCH / DELETE | `/workspaces/:id` | DELETE also removes its papers, files and vectors |
| GET | `/workspaces/:id/papers` | Papers with `status`: `queued`, `processing`, `ready` or `failed` |
| POST | `/workspaces/:id/papers` | multipart, field `files` (up to 10 PDFs, 25 MB each). Processing runs in the background |
| GET / PATCH / DELETE | `/papers/:id` | PATCH `{title}` |
| GET | `/papers/:id/file` | Streams the original PDF |
| POST | `/papers/:id/reprocess` | Retries a failed paper |
| POST | `/workspaces/:id/ask` | `{question, paperIds?}`; an empty `paperIds` means the whole workspace |
| GET / DELETE | `/workspaces/:id/questions` | Question history |
| GET | `/health` | Status of the API, the database and the AI service |

**AI service (FastAPI). Every call needs the `X-Internal-Key` header.**

| Method | Route | Body / response |
|---|---|---|
| POST | `/papers/process` | multipart `paper_id`, `file` → `{title, num_pages, num_chunks, word_count, sections}` |
| DELETE | `/papers/{paper_id}` | Deletes the paper's vectors |
| POST | `/ask` | `{question, papers:[{id,title}], top_k?}` → `{answer, insufficient_evidence, sources:[{id, paper_id, paper_title, section, page_start, page_end, score, text, cited}]}` |
| GET | `/health` | Model info and whether Gemini is configured |

Interactive docs: http://127.0.0.1:8000/docs

---

## Known limitations (Phase 1)
- Tables, equations and figures are not extracted cleanly.
- Section detection is rule-based and can miss headings in unusual layouts.
- Grounding in the papers reduces hallucination but doesn't remove it, so always check the cited page.
- Vectors are stored on the AI service's local disk. On free hosting, use a persistent disk, or move to MongoDB Atlas Vector Search later.

## Next phases
Paper search and import (Semantic Scholar/OpenAlex), structured summaries, multi-paper comparison, an evaluation script (Recall@K, citation accuracy), and deployment.
