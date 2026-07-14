"""
================================================================================
 notebase pipeline — stage 1: ocr.py
================================================================================
Extracts the text of every page of every PDF under pdfs/.

READS:   pdfs/<subject>/<name>.pdf        (subject = first folder level;
                                           PDFs directly under pdfs/ get
                                           subject "general")
WRITES:  build/ocr-output.json            list of
                                          {subject, filename, page_number,
                                           text, source}

HOW A PAGE IS PROCESSED (hybrid strategy):

  1. EMBEDDED TEXT FIRST. Born-digital PDFs (LaTeX exports, typed documents,
     iPad notes apps that export real text) carry a perfectly accurate text
     layer. If PyMuPDF finds >= MIN_EMBEDDED_TEXT_CHARS characters of it, we
     use that and skip OCR entirely (source = "embedded").

  2. OCR FALLBACK for image scans. The page is rendered to a bitmap at
     RENDER_DPI (300), preprocessed with Pillow — grayscale conversion, then
     contrast enhancement (factor CONTRAST_FACTOR = 2.0) to make faint pen
     strokes pop — and fed to Tesseract (source = "ocr").

     Caveat: Tesseract is built for print. On handwriting it is best-effort;
     garbled words are expected and partially compensated for downstream by
     the embedding model's tolerance of noisy text. Open the JSON output of
     this stage to audit exactly what was extracted from each page.

FAILURE POLICY: one bad page (or one unreadable PDF) logs a warning and is
skipped — it never aborts the run. Pages that yield no text at all are kept
in the output with text = "" so the count is honest, but downstream stages
ignore them.

CLI:
    python pipeline/ocr.py                 # full run over pdfs/, writes JSON
    python pipeline/ocr.py path/to/a.pdf   # verification mode: process one
                                           # PDF and print its text to stdout
================================================================================
"""

import io
import json
import logging
import shutil
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

import fitz  # PyMuPDF
import pytesseract
from PIL import Image, ImageEnhance, ImageOps

from config import (
    BUILD_DIR,
    CONTRAST_FACTOR,
    DEFAULT_SUBJECT,
    MIN_EMBEDDED_TEXT_CHARS,
    OCR_OUTPUT_PATH,
    PDFS_DIR,
    RENDER_DPI,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("ocr")


@dataclass
class PageRecord:
    """Extracted text of a single PDF page, plus where it came from.

    `source` is "embedded" (text layer read directly from the PDF) or "ocr"
    (Tesseract over the rendered image) — useful when auditing quality.
    `page_number` is 1-based, matching what a PDF viewer displays.
    """

    subject: str
    filename: str
    page_number: int
    text: str
    source: str


def check_tesseract() -> None:
    """Exit with an actionable message if the Tesseract binary is missing.

    Failing here beats failing on every single page later.
    """
    if shutil.which("tesseract") is None:
        log.error(
            "Tesseract binary not found on PATH. Install it first:\n"
            "  macOS:  brew install tesseract\n"
            "  Debian: sudo apt-get install tesseract-ocr"
        )
        sys.exit(1)


def discover_pdfs() -> list[tuple[str, Path]]:
    """Find every PDF under PDFS_DIR and derive its subject label.

    The subject is the first directory level under pdfs/ (e.g.
    pdfs/math/foo.pdf -> "math"). A PDF directly under pdfs/ gets
    DEFAULT_SUBJECT. Returns (subject, path) pairs sorted for stable output.
    """
    if not PDFS_DIR.is_dir():
        log.warning("Input directory %s does not exist — nothing to do.", PDFS_DIR)
        return []
    pairs: list[tuple[str, Path]] = []
    for pdf_path in sorted(PDFS_DIR.rglob("*.pdf")):
        relative = pdf_path.relative_to(PDFS_DIR)
        subject = relative.parts[0] if len(relative.parts) > 1 else DEFAULT_SUBJECT
        pairs.append((subject, pdf_path))
    return pairs


def preprocess_image(image: Image.Image) -> Image.Image:
    """Prepare a rendered page bitmap for Tesseract.

    Grayscale strips color noise (colored ink, paper tint); the contrast
    boost (CONTRAST_FACTOR) separates faint strokes from the background.
    """
    gray = ImageOps.grayscale(image)
    return ImageEnhance.Contrast(gray).enhance(CONTRAST_FACTOR)


def ocr_page(page: fitz.Page) -> str:
    """Render one page at RENDER_DPI and run Tesseract over it."""
    pixmap = page.get_pixmap(dpi=RENDER_DPI)
    image = Image.open(io.BytesIO(pixmap.tobytes("png")))
    return pytesseract.image_to_string(preprocess_image(image))


def extract_page_text(page: fitz.Page) -> tuple[str, str]:
    """Extract one page's text, preferring the embedded layer over OCR.

    Returns (text, source) where source is "embedded" or "ocr" — see the
    module docstring for the full rationale of the hybrid strategy.
    """
    embedded = page.get_text().strip()
    if len(embedded) >= MIN_EMBEDDED_TEXT_CHARS:
        return embedded, "embedded"
    return ocr_page(page).strip(), "ocr"


def process_pdf(subject: str, pdf_path: Path) -> list[PageRecord]:
    """Extract text from every page of one PDF.

    Page-level failures are logged and skipped; a PDF that cannot be opened
    at all returns an empty list. The pipeline never crashes on bad input.
    """
    try:
        doc = fitz.open(pdf_path)
    except Exception as exc:  # fitz raises various exception types
        log.warning("Cannot open %s (%s) — skipping file.", pdf_path.name, exc)
        return []

    records: list[PageRecord] = []
    with doc:
        for index, page in enumerate(doc):
            page_number = index + 1  # 1-based, as shown in PDF viewers
            try:
                text, source = extract_page_text(page)
            except Exception as exc:
                log.warning(
                    "Failed on %s page %d (%s) — skipping page.",
                    pdf_path.name, page_number, exc,
                )
                continue
            if not text:
                log.warning("%s page %d yielded no text.", pdf_path.name, page_number)
            records.append(
                PageRecord(subject, pdf_path.name, page_number, text, source)
            )
    return records


def main() -> None:
    """Run stage 1 and print a one-line summary (see module docstring)."""
    check_tesseract()

    # Verification mode: one PDF given on the command line — print, don't write.
    if len(sys.argv) > 1:
        pdf_path = Path(sys.argv[1])
        if not pdf_path.is_file():
            log.error("No such file: %s", pdf_path)
            sys.exit(1)
        records = process_pdf(DEFAULT_SUBJECT, pdf_path)
        for rec in records:
            print(f"\n===== page {rec.page_number} [{rec.source}] "
                  f"({len(rec.text)} chars) =====")
            print(rec.text[:500] or "(no text)")
        print(f"\nExtracted text from {len(records)} pages of {pdf_path.name}.")
        return

    # Full run over pdfs/.
    pdf_pairs = discover_pdfs()
    all_records: list[PageRecord] = []
    for subject, pdf_path in pdf_pairs:
        log.info("Processing %s/%s ...", subject, pdf_path.name)
        all_records.extend(process_pdf(subject, pdf_path))

    BUILD_DIR.mkdir(exist_ok=True)
    OCR_OUTPUT_PATH.write_text(
        json.dumps([asdict(r) for r in all_records], ensure_ascii=False, indent=1)
    )

    empty = sum(1 for r in all_records if not r.text)
    embedded = sum(1 for r in all_records if r.source == "embedded")
    print(
        f"OCR complete: {len(all_records)} pages across {len(pdf_pairs)} PDFs "
        f"({embedded} from embedded text, {len(all_records) - embedded} via OCR, "
        f"{empty} empty) -> {OCR_OUTPUT_PATH.relative_to(OCR_OUTPUT_PATH.parent.parent)}"
    )


if __name__ == "__main__":
    main()
