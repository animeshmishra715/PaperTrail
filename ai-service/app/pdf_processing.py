"""PDF -> clean text -> sections -> overlapping chunks, keeping page numbers throughout."""

import re
from collections import Counter
from dataclasses import dataclass, field

import fitz  # PyMuPDF

from . import config

# (canonical name, regex for the heading text without numbering)
KNOWN_SECTIONS = [
    ("Abstract", r"abstract"),
    ("Introduction", r"introduction|overview"),
    ("Related Work", r"related\s+works?|literature\s+(review|survey)|background(\s+and\s+related\s+work)?|prior\s+work"),
    ("Methodology", r"methods?|methodology|approach|proposed\s+(method|approach|system|model|framework|work)"
                    r"|system\s+(design|architecture|model|overview)|materials\s+and\s+methods|model|framework"),
    ("Dataset", r"datasets?|data(\s+collection|\s+description)?"),
    ("Experiments", r"experiments?|experimental\s+(setup|settings?|results|evaluation|design)|evaluation|implementation(\s+details)?"),
    ("Results", r"results?(\s+and\s+(discussion|analysis))?|discussion|analysis|performance\s+evaluation"),
    ("Limitations", r"limitations?|threats\s+to\s+validity"),
    ("Conclusion", r"conclusions?(\s+and\s+future\s+(work|directions))?|concluding\s+remarks|future\s+work|summary"),
    ("References", r"references|bibliography|works\s+cited"),
    ("Acknowledgements", r"acknowledge?ments?"),
    ("Appendix", r"appendix(\s+[a-z0-9]+)?.*"),
]
# These are common enough as heading words that we trust them even without bold/large font.
TRUSTED_UNSTYLED = {"Abstract", "Introduction", "References", "Conclusion", "Acknowledgements"}
# Content after these is not indexed (citation lists only add noise to retrieval).
STOP_SECTIONS = {"References", "Acknowledgements"}

NUMBER_PREFIX = r"(?:(?:\d+(?:\.\d+)*|[IVXLC]+|[A-H])[.)]?\s+)"
KNOWN_RE = [(name, re.compile(rf"^{NUMBER_PREFIX}?(?:{pat})\s*:?$", re.I)) for name, pat in KNOWN_SECTIONS]
NUMBERED_HEADING_RE = re.compile(r"^(\d+|[IVX]+)\.?\s+[A-Z][A-Za-z0-9 ,:&()'\-/]{2,70}$")
AMBIGUOUS_RE = re.compile(r"^(data|model|framework|summary|analysis|approach|implementation|evaluation)\s*:?$", re.I)
INLINE_ABSTRACT_RE = re.compile(r"^abstract\s*[—–:.\-]+\s*", re.I)
PAGE_NUMBER_RE = re.compile(r"^(page\s*)?\d{1,4}(\s*(of|/)\s*\d{1,4})?$", re.I)


class PDFProcessingError(Exception):
    pass


@dataclass
class Line:
    text: str
    page: int  # 1-based
    size: float
    bold: bool


@dataclass
class Section:
    name: str
    words: list = field(default_factory=list)  # list of (word, page)


def _read_lines(doc: fitz.Document) -> list[Line]:
    lines = []
    for page_index, page in enumerate(doc):
        data = page.get_text("dict")
        for block in data["blocks"]:
            if block.get("type") != 0:
                continue  # images
            for line in block["lines"]:
                spans = [s for s in line["spans"] if s["text"].strip()]
                if not spans:
                    continue
                text = " ".join("".join(s["text"] for s in spans).split())
                size = max(s["size"] for s in spans)
                bold = all((s["flags"] & 16) or "bold" in s["font"].lower() for s in spans)
                lines.append(Line(text, page_index + 1, round(size, 1), bold))
    return lines


def _remove_headers_footers(lines: list[Line], num_pages: int) -> list[Line]:
    """Drops page numbers and short lines that repeat on many pages (running headers/footers)."""
    def key(text):
        return re.sub(r"\d+", "#", text.lower())

    pages_per_key = {}
    for ln in lines:
        if len(ln.text) < 120:
            pages_per_key.setdefault(key(ln.text), set()).add(ln.page)

    threshold = max(3, int(num_pages * 0.4))
    repeated = {k for k, pages in pages_per_key.items() if num_pages >= 3 and len(pages) >= threshold}
    return [ln for ln in lines if not PAGE_NUMBER_RE.match(ln.text) and key(ln.text) not in repeated]


def _body_font_size(lines: list[Line]) -> float:
    counts = Counter()
    for ln in lines:
        counts[ln.size] += len(ln.text)
    return counts.most_common(1)[0][0] if counts else 10.0


def _clean_heading(text: str) -> str:
    text = re.sub(rf"^{NUMBER_PREFIX}", "", text).strip().rstrip(":").strip()
    return text.title() if text.isupper() else text


def _detect_heading(ln: Line, body_size: float) -> str | None:
    text = ln.text.strip()
    if len(text.split()) > 10 or len(text) < 3:
        return None
    larger = ln.size >= body_size + 0.8
    styled = ln.bold or larger or (text.isupper() and len(text) > 4)
    numbered = bool(re.match(NUMBER_PREFIX, text))

    for name, rx in KNOWN_RE:
        if not rx.match(text):
            continue
        # Single generic words ("Data", "Model") are often bold sub-headings or table headers,
        # so they only count as sections when numbered or in a larger font.
        if AMBIGUOUS_RE.match(text) and not (numbered or larger):
            return None
        if styled or numbered or name in TRUSTED_UNSTYLED:
            return name
    if text.endswith(".") or not text[0].isalnum():
        return None
    # Paper-specific numbered headings such as "3 Graph Attention Networks"
    if styled and NUMBERED_HEADING_RE.match(text):
        return _clean_heading(text)
    # Unnumbered headings in a larger font, e.g. "Proposed System:"
    if larger and len(text.split()) <= 8:
        return _clean_heading(text)
    return None


def _detect_title(doc: fitz.Document, lines: list[Line], fallback: str) -> tuple[str, set[int]]:
    """Title = the consecutive run of largest-font lines near the top of page 1.
    Also returns those line indices so a wrapped title line is not mistaken for a heading."""
    first_page = [(i, ln) for i, ln in enumerate(lines[:30]) if ln.page == 1]
    candidates = [ln.size for _, ln in first_page if len(ln.text.split()) >= 2]
    if candidates:
        top = max(candidates)
        runs, current = [], []
        for i, ln in first_page:
            if ln.size == top:
                current.append(i)
            elif current:
                runs.append(current)
                current = []
        runs.append(current)
        for indices in runs:
            title = " ".join(lines[i].text for i in indices).strip()
            if 10 <= len(title) <= 300:
                return title, set(indices)
    meta = (doc.metadata or {}).get("title", "").strip()
    if 10 <= len(meta) <= 300:
        return meta, set()
    return fallback, set()


def _build_sections(lines: list[Line], body_size: float, title_lines: set[int]) -> list[Section]:
    sections = [Section("Front Matter")]
    skipping = False
    pending_hyphen = None  # (word_prefix, page) waiting to be joined with next line's first word

    for idx, ln in enumerate(lines):
        heading = None if idx in title_lines else _detect_heading(ln, body_size)
        text = ln.text
        if heading is None and INLINE_ABSTRACT_RE.match(text):
            heading, text = "Abstract", INLINE_ABSTRACT_RE.sub("", text)
        elif heading is not None:
            text = ""

        if heading is not None:
            skipping = heading in STOP_SECTIONS
            if not skipping:
                sections.append(Section(heading))
            pending_hyphen = None
        if skipping or not text:
            continue

        words = text.split()
        if pending_hyphen and words and words[0][:1].islower():
            words[0] = pending_hyphen[0] + words[0]
            pending_hyphen = None
        elif pending_hyphen:
            sections[-1].words.append((pending_hyphen[0] + "-", pending_hyphen[1]))
            pending_hyphen = None

        if words and words[-1].endswith("-") and len(words[-1]) > 2:
            pending_hyphen = (words.pop()[:-1], ln.page)
        sections[-1].words.extend((w, ln.page) for w in words)

    return [s for s in sections if s.words]


def _chunk_sections(sections: list[Section], size: int, overlap: int) -> list[dict]:
    chunks = []
    step = max(1, size - overlap)
    for sec in sections:
        words = sec.words
        start = 0
        while start < len(words):
            window = words[start:start + size]
            # Avoid a tiny trailing chunk that only repeats the overlap.
            if start > 0 and len(window) <= overlap:
                break
            chunks.append({
                "chunk_index": len(chunks),
                "section": sec.name,
                "page_start": window[0][1],
                "page_end": window[-1][1],
                "text": " ".join(w for w, _ in window),
            })
            start += step
    return chunks


def process_pdf(data: bytes, filename: str = "paper.pdf") -> dict:
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise PDFProcessingError(f"Could not open PDF: {exc}") from exc

    with doc:
        if doc.needs_pass:
            raise PDFProcessingError("PDF is password protected.")
        num_pages = doc.page_count
        lines = _read_lines(doc)
        lines = _remove_headers_footers(lines, num_pages)
        body_size = _body_font_size(lines)
        title, title_lines = _detect_title(doc, lines, fallback=re.sub(r"\.pdf$", "", filename, flags=re.I))
        sections = _build_sections(lines, body_size, title_lines)

    word_count = sum(len(s.words) for s in sections)
    if word_count < 50:
        raise PDFProcessingError(
            "Almost no text could be extracted. This looks like a scanned/image-only PDF, which is not supported yet."
        )

    chunks = _chunk_sections(sections, config.CHUNK_SIZE, config.CHUNK_OVERLAP)
    return {
        "title": title,
        "num_pages": num_pages,
        "word_count": word_count,
        "sections": [s.name for s in sections],
        "chunks": chunks,
    }
