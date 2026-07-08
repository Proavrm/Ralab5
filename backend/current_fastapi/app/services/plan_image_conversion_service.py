"""Convert plan files (PDF, etc.) to PNG for plan d'implantation."""
from __future__ import annotations

from pathlib import Path

from app.services.demande_document_storage_service import sanitize_filename

PLAN_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"}


def is_plan_image_filename(filename: str) -> bool:
    return Path(str(filename or "")).suffix.lower() in PLAN_IMAGE_EXTENSIONS


def plan_image_output_name(original_filename: str) -> str:
    stem = Path(sanitize_filename(original_filename)).stem or "plan"
    return f"{stem}.png"


def convert_plan_bytes_to_png(content: bytes, original_filename: str) -> tuple[bytes, str]:
    if not content:
        raise ValueError("Fichier vide")

    ext = Path(sanitize_filename(original_filename)).suffix.lower()
    output_name = plan_image_output_name(original_filename)

    if ext in PLAN_IMAGE_EXTENSIONS:
        return content, sanitize_filename(original_filename)

    if ext == ".pdf":
        return _convert_pdf_to_png(content, output_name)

    return _convert_generic_to_png(content, output_name)


def _convert_pdf_to_png(content: bytes, output_name: str) -> tuple[bytes, str]:
    try:
        import fitz  # PyMuPDF
    except ImportError as exc:
        raise ValueError(
            "Conversion PDF indisponible (PyMuPDF manquant). Installez pymupdf sur le serveur."
        ) from exc

    doc = fitz.open(stream=content, filetype="pdf")
    try:
        if doc.page_count < 1:
            raise ValueError("PDF vide")
        page = doc.load_page(0)
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        png_bytes = pix.tobytes("png")
    finally:
        doc.close()

    if not png_bytes:
        raise ValueError("Conversion PDF en image impossible")
    return png_bytes, output_name


def _convert_generic_to_png(content: bytes, output_name: str) -> tuple[bytes, str]:
    try:
        from PIL import Image
        from io import BytesIO
    except ImportError as exc:
        raise ValueError(
            "Conversion image indisponible (Pillow manquant). Installez pillow sur le serveur."
        ) from exc

    with Image.open(BytesIO(content)) as image:
        rgb = image.convert("RGB")
        buffer = BytesIO()
        rgb.save(buffer, format="PNG")
        png_bytes = buffer.getvalue()

    if not png_bytes:
        raise ValueError("Conversion en image impossible")
    return png_bytes, output_name
