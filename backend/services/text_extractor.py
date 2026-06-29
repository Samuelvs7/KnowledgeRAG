import io
import zipfile
from pypdf import PdfReader
import docx

def extract_text_from_file(file_bytes: bytes, file_type: str) -> str:
    """Extract plain text from supported document formats."""
    text = ""
    file_stream = io.BytesIO(file_bytes)
    normalized_type = (file_type or "").lower()
    
    if normalized_type in {"pdf", "application/pdf"} or normalized_type.endswith("/pdf"):
        reader = PdfReader(file_stream)
        for page in reader.pages:
             extracted = page.extract_text()
             if extracted:
                 text += extracted + "\n"
    elif normalized_type in {
        "docx",
        "doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    }:
        doc = docx.Document(file_stream)
        for para in doc.paragraphs:
            if para.text:
                text += para.text + "\n"
    elif normalized_type in {"zip", "application/zip", "application/x-zip-compressed"}:
        text = _extract_supported_zip_text(file_stream)
    else:
        try:
            text = file_stream.read().decode("utf-8")
        except UnicodeDecodeError:
            pass
            
    return text.strip()

def _extract_supported_zip_text(file_stream: io.BytesIO) -> str:
    supported_extensions = (".txt", ".md", ".markdown", ".csv")
    collected: list[str] = []

    with zipfile.ZipFile(file_stream) as archive:
        for name in archive.namelist():
            if name.endswith("/") or not name.lower().endswith(supported_extensions):
                continue
            with archive.open(name) as member:
                try:
                    content = member.read().decode("utf-8")
                except UnicodeDecodeError:
                    continue
                collected.append(f"\n--- {name} ---\n{content}")

    return "\n".join(collected)
