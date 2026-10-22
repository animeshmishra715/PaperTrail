import logging
import time

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

from . import config, vector_store
from .embeddings import embed, get_model
from .pdf_processing import PDFProcessingError, process_pdf
from .rag import LLMError, answer_question

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("papertrail.ai")

app = FastAPI(title="PaperTrail AI Service", version="0.1.0")


def check_key(x_internal_key: str | None = Header(default=None)):
    if config.AI_SERVICE_KEY and x_internal_key != config.AI_SERVICE_KEY:
        raise HTTPException(status_code=401, detail="Invalid internal key")


class PaperRef(BaseModel):
    id: str
    title: str | None = None


class AskRequest(BaseModel):
    question: str = Field(min_length=2, max_length=2000)
    papers: list[PaperRef] = Field(min_length=1)
    top_k: int | None = Field(default=None, ge=1, le=30)


@app.on_event("startup")
def warm_up():
    # Loading the embedding model takes a few seconds; do it once at startup, not on the first upload.
    get_model()
    log.info("Embedding model loaded: %s", config.EMBEDDING_MODEL)


@app.get("/health")
def health():
    return {"status": "ok", "embedding_model": config.EMBEDDING_MODEL,
            "llm_model": config.GEMINI_MODEL, "llm_configured": bool(config.GEMINI_API_KEY)}


@app.post("/papers/process", dependencies=[Depends(check_key)])
def process_paper(paper_id: str = Form(...), file: UploadFile = File(...)):
    started = time.time()
    data = file.file.read()
    try:
        result = process_pdf(data, file.filename or "paper.pdf")
    except PDFProcessingError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    chunks = result.pop("chunks")
    # Prefixing the section name gives the embedding a little extra context.
    vectors = embed([f"{c['section']}: {c['text']}" for c in chunks])
    try:
        vector_store.save_paper(paper_id, chunks, vectors, result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    log.info("Processed %s: %d pages, %d chunks in %.1fs", paper_id, result["num_pages"], len(chunks),
             time.time() - started)
    return {"paper_id": paper_id, **result, "num_chunks": len(chunks)}


@app.delete("/papers/{paper_id}", dependencies=[Depends(check_key)])
def delete_paper(paper_id: str):
    try:
        return {"deleted": vector_store.delete_paper(paper_id)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/ask", dependencies=[Depends(check_key)])
def ask(req: AskRequest):
    try:
        return answer_question(req.question, [p.model_dump() for p in req.papers], req.top_k)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
