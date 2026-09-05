import os
import re
import hashlib
import zipfile
from dataclasses import dataclass, field
from typing import Any, List, Optional, Tuple, Dict

# Supported language definitions
LANGUAGE_EXTENSIONS = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".java": "java",
    ".go": "go",
    ".rs": "rust",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".hpp": "cpp",
    ".cs": "csharp",
    ".php": "php",
    ".rb": "ruby",
    ".swift": "swift",
    ".kt": "kotlin",
    ".sql": "sql",
    ".html": "html",
    ".css": "css",
    ".scss": "css",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".md": "markdown",
    ".toml": "toml",
    ".sh": "bash",
    ".bash": "bash",
    ".dockerfile": "dockerfile",
    "Dockerfile": "dockerfile",
}

# Directories and files to ignore during repository processing
IGNORED_DIRS = {
    "node_modules", ".git", ".svn", ".hg", "dist", "build", "out",
    "__pycache__", ".venv", "venv", "env", ".next", ".nuxt", "coverage",
    ".idea", ".vscode", ".target", "target", "vendor", "bin", "obj",
    "tmp", "temp", "logs", ".bundle", "pods"
}

IGNORED_EXTENSIONS = {
    # Binaries & Media
    ".exe", ".dll", ".so", ".dylib", ".bin", ".zip", ".tar", ".gz", ".7z",
    ".rar", ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp",
    ".mp3", ".mp4", ".wav", ".avi", ".mov", ".woff", ".woff2", ".ttf", ".eot",
    ".pyc", ".pyo", ".pyd", ".db", ".sqlite", ".sqlite3", ".class", ".jar",
    ".lock", "-lock.json", ".min.js", ".min.css", ".map"
}

MAX_FILE_SIZE_FOR_CONTENT = 256 * 1024  # 256 KB content storage cap
MAX_FILE_SIZE_FOR_PARSING = 1024 * 1024  # 1 MB parsing cap


@dataclass
class ParsedSymbol:
    name: str
    symbol_type: str  # function, class, interface, type, constant
    file_path: str
    start_line: int
    end_line: int
    signature: Optional[str] = None
    parent_symbol: Optional[str] = None
    documentation: Optional[str] = None
    parsing_method: str = "ast"  # ast, regex, or text


@dataclass
class ParsedChunk:
    chunk_index: int
    file_path: str
    file_name: str
    content: str
    language: str
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ParsedFile:
    file_path: str
    file_name: str
    language: str
    content: str
    content_hash: str
    file_size: int
    line_count: int
    is_binary: bool
    content_stored: bool
    symbols: List[ParsedSymbol] = field(default_factory=list)
    chunks: List[ParsedChunk] = field(default_factory=list)
    imports: List[str] = field(default_factory=list)
    parsing_method: str = "text"  # ast, regex, or text


@dataclass
class RepositoryAnalysis:
    repository_id: str
    total_files: int
    total_lines: int
    total_functions: int
    total_classes: int
    language_breakdown: Dict[str, int]
    entry_points: List[str]
    architecture_evidence: Dict[str, Any]
    files: List[ParsedFile]
    all_symbols: List[ParsedSymbol]
    all_chunks: List[ParsedChunk]


class CodeParserService:
    """Robust, multi-stage code parser with AST-first parsing, regex fallback, and safety safeguards."""

    @staticmethod
    def is_binary_content(data: bytes) -> bool:
        """Detect if raw bytes represent binary content."""
        if not data:
            return False
        if b'\x00' in data[:8192]:
            return True
        # Check ratio of printable text characters
        text_characters = bytearray({7, 8, 9, 10, 12, 13, 27} | set(range(0x20, 0x100)) - {0x7f})
        non_text = sum(1 for byte in data[:1024] if byte not in text_characters)
        return (non_text / max(1, len(data[:1024]))) > 0.30

    @staticmethod
    def compute_content_hash(content: str) -> str:
        """Compute SHA-256 content hash for incremental indexing tracking."""
        return hashlib.sha256(content.encode('utf-8')).hexdigest()

    @staticmethod
    def detect_language(file_path: str) -> str:
        """Detect programming language from file extension or basename."""
        file_name = os.path.basename(file_path)
        if file_name in LANGUAGE_EXTENSIONS:
            return LANGUAGE_EXTENSIONS[file_name]
        _, ext = os.path.splitext(file_path.lower())
        return LANGUAGE_EXTENSIONS.get(ext, "unknown")

    @classmethod
    def should_ignore(cls, file_path: str) -> bool:
        """Check if file should be ignored during indexing."""
        parts = file_path.replace("\\", "/").split("/")
        for part in parts:
            if part in IGNORED_DIRS or part.startswith("."):
                if part not in {".github", ".gitignore", ".env.example"}:
                    return True
        _, ext = os.path.splitext(file_path.lower())
        if ext in IGNORED_EXTENSIONS:
            return True
        return False

    @classmethod
    def process_zip(cls, zip_path: str, repository_id: str) -> RepositoryAnalysis:
        """Extract and parse an entire repository ZIP file safely."""
        parsed_files: List[ParsedFile] = []
        all_symbols: List[ParsedSymbol] = []
        all_chunks: List[ParsedChunk] = []

        total_lines = 0
        total_functions = 0
        total_classes = 0
        language_breakdown: Dict[str, int] = {}
        entry_points: List[str] = []
        imports_summary: Dict[str, List[str]] = {}

        with zipfile.ZipFile(zip_path, 'r') as z:
            namelist = z.namelist()
            # Strip common root directory if ZIP was archived as a single folder
            prefix = ""
            top_level = {p.split('/')[0] for p in namelist if '/' in p}
            if len(top_level) == 1:
                prefix = list(top_level)[0] + "/"

            for member in namelist:
                if member.endswith('/') or not member:
                    continue
                rel_path = member[len(prefix):] if prefix and member.startswith(prefix) else member
                if not rel_path or cls.should_ignore(rel_path):
                    continue

                info = z.getinfo(member)
                file_size = info.file_size

                if file_size > MAX_FILE_SIZE_FOR_PARSING:
                    # Skip huge files entirely from chunking to protect DB
                    continue

                raw_data = z.read(member)
                if cls.is_binary_content(raw_data):
                    continue

                try:
                    content = raw_data.decode('utf-8', errors='replace')
                except Exception:
                    continue

                language = cls.detect_language(rel_path)
                lines = content.splitlines()
                line_count = len(lines)
                total_lines += line_count
                language_breakdown[language] = language_breakdown.get(language, 0) + 1

                content_hash = cls.compute_content_hash(content)
                content_stored = file_size <= MAX_FILE_SIZE_FOR_CONTENT
                stored_content = content if content_stored else ""

                # Parse symbols, imports, and chunks
                parsed_file = cls.parse_file_content(
                    file_path=rel_path,
                    content=content,
                    language=language,
                    content_hash=content_hash,
                    file_size=file_size,
                    line_count=line_count,
                    content_stored=content_stored,
                    stored_content=stored_content
                )

                parsed_files.append(parsed_file)
                all_symbols.extend(parsed_file.symbols)
                all_chunks.extend(parsed_file.chunks)

                for sym in parsed_file.symbols:
                    if sym.symbol_type == "function":
                        total_functions += 1
                    elif sym.symbol_type == "class":
                        total_classes += 1

                if parsed_file.imports:
                    imports_summary[rel_path] = parsed_file.imports

                # Detect entry points
                if rel_path.lower() in {
                    "main.py", "app.py", "index.ts", "index.js", "main.go",
                    "main.rs", "app.tsx", "server.js", "server.ts", "src/main.py",
                    "src/index.ts", "src/app.tsx", "src/main.rs"
                }:
                    entry_points.append(rel_path)

        # Build architecture evidence
        architecture_evidence = {
            "entry_points": entry_points,
            "language_distribution": language_breakdown,
            "total_file_count": len(parsed_files),
            "imports_graph_sample": {k: v[:5] for k, v in list(imports_summary.items())[:15]}
        }

        return RepositoryAnalysis(
            repository_id=repository_id,
            total_files=len(parsed_files),
            total_lines=total_lines,
            total_functions=total_functions,
            total_classes=total_classes,
            language_breakdown=language_breakdown,
            entry_points=entry_points,
            architecture_evidence=architecture_evidence,
            files=parsed_files,
            all_symbols=all_symbols,
            all_chunks=all_chunks
        )

    @classmethod
    def parse_file_content(
        cls,
        file_path: str,
        content: str,
        language: str,
        content_hash: str,
        file_size: int,
        line_count: int,
        content_stored: bool,
        stored_content: str
    ) -> ParsedFile:
        """Parse file content using AST parser if available, falling back to regex or text."""
        file_name = os.path.basename(file_path)
        symbols: List[ParsedSymbol] = []
        imports: List[str] = []
        parsing_method = "text"

        # Step 1: Try Tree-Sitter AST parsing
        ast_symbols, ast_imports = cls._try_tree_sitter_parse(file_path, content, language)
        if ast_symbols is not None:
            symbols = ast_symbols
            imports = ast_imports or []
            parsing_method = "ast"
        else:
            # Step 2: Fallback Regex parser
            regex_symbols, regex_imports = cls._try_regex_parse(file_path, content, language)
            if regex_symbols:
                symbols = regex_symbols
                imports = regex_imports
                parsing_method = "regex"
            else:
                parsing_method = "text"

        # Step 3: Code-aware Chunking
        chunks = cls.create_code_chunks(file_path, file_name, content, language, symbols)

        return ParsedFile(
            file_path=file_path,
            file_name=file_name,
            language=language,
            content=stored_content,
            content_hash=content_hash,
            file_size=file_size,
            line_count=line_count,
            is_binary=False,
            content_stored=content_stored,
            symbols=symbols,
            chunks=chunks,
            imports=imports,
            parsing_method=parsing_method
        )

    @classmethod
    def _try_tree_sitter_parse(cls, file_path: str, content: str, language: str) -> Tuple[Optional[List[ParsedSymbol]], Optional[List[str]]]:
        """Attempt AST parsing with tree-sitter if installed for the language."""
        try:
            import tree_sitter  # type: ignore
            # Dynamically check for tree-sitter language modules
            ts_lang_module = None
            if language == "python":
                import tree_sitter_python as ts_lang_module
            elif language in ("javascript", "typescript"):
                import tree_sitter_typescript as ts_lang_module

            if ts_lang_module is not None:
                parser = tree_sitter.Parser()
                parser.set_language(tree_sitter.Language(ts_lang_module.language()))
                tree = parser.parse(content.encode('utf-8'))
                
                symbols: List[ParsedSymbol] = []
                imports: List[str] = []
                
                # Traverse AST tree
                cursor = tree.walk()
                cls._traverse_ast_node(cursor.node, content.splitlines(), file_path, symbols, imports)
                return symbols, imports
        except Exception:
            pass  # Graceful degradation to regex
        return None, None

    @classmethod
    def _traverse_ast_node(cls, node: Any, lines: List[str], file_path: str, symbols: List[ParsedSymbol], imports: List[str], parent_name: Optional[str] = None):
        """Recursively walk tree-sitter AST nodes to extract symbols."""
        node_type = str(node.type)
        start_line = node.start_point[0] + 1
        end_line = node.end_point[0] + 1

        curr_parent = parent_name
        if node_type in ("function_definition", "method_definition", "function_declaration"):
            name_node = node.child_by_field_name("name")
            name = name_node.text.decode('utf-8') if name_node else "anonymous"
            sig = lines[start_line - 1].strip() if start_line <= len(lines) else ""
            symbols.append(ParsedSymbol(
                name=name,
                symbol_type="function",
                file_path=file_path,
                start_line=start_line,
                end_line=end_line,
                signature=sig,
                parent_symbol=parent_name,
                parsing_method="ast"
            ))
            curr_parent = name

        elif node_type in ("class_definition", "class_declaration", "interface_declaration"):
            name_node = node.child_by_field_name("name")
            name = name_node.text.decode('utf-8') if name_node else "AnonymousClass"
            sig = lines[start_line - 1].strip() if start_line <= len(lines) else ""
            symbols.append(ParsedSymbol(
                name=name,
                symbol_type="class" if "interface" not in node_type else "interface",
                file_path=file_path,
                start_line=start_line,
                end_line=end_line,
                signature=sig,
                parent_symbol=parent_name,
                parsing_method="ast"
            ))
            curr_parent = name

        elif node_type in ("import_statement", "import_from_statement"):
            imp_text = lines[start_line - 1].strip() if start_line <= len(lines) else ""
            if imp_text:
                imports.append(imp_text)

        for child in node.children:
            cls._traverse_ast_node(child, lines, file_path, symbols, imports, curr_parent)

    @classmethod
    def _try_regex_parse(cls, file_path: str, content: str, language: str) -> Tuple[List[ParsedSymbol], List[str]]:
        """Fallback regex parser for languages without active AST grammars."""
        symbols: List[ParsedSymbol] = []
        imports: List[str] = []
        lines = content.splitlines()

        if language == "python":
            for i, line in enumerate(lines, 1):
                # Python function pattern
                fn_match = re.match(r'^(?:    |\t)*def\s+([a-zA-Z0-9_]+)\s*\(', line)
                if fn_match:
                    name = fn_match.group(1)
                    end = cls._find_block_end(lines, i - 1, indent_based=True)
                    symbols.append(ParsedSymbol(
                        name=name, symbol_type="function", file_path=file_path,
                        start_line=i, end_line=end, signature=line.strip(), parsing_method="regex"
                    ))

                # Python class pattern
                cls_match = re.match(r'^(?:    |\t)*class\s+([a-zA-Z0-9_]+)', line)
                if cls_match:
                    name = cls_match.group(1)
                    end = cls._find_block_end(lines, i - 1, indent_based=True)
                    symbols.append(ParsedSymbol(
                        name=name, symbol_type="class", file_path=file_path,
                        start_line=i, end_line=end, signature=line.strip(), parsing_method="regex"
                    ))

                # Python import pattern
                if line.startswith("import ") or line.startswith("from "):
                    imports.append(line.strip())

        elif language in ("typescript", "javascript"):
            for i, line in enumerate(lines, 1):
                # JS/TS function
                fn_match = re.search(r'(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_]+)', line)
                if fn_match:
                    name = fn_match.group(1)
                    end = cls._find_block_end(lines, i - 1, indent_based=False)
                    symbols.append(ParsedSymbol(
                        name=name, symbol_type="function", file_path=file_path,
                        start_line=i, end_line=end, signature=line.strip(), parsing_method="regex"
                    ))

                # JS/TS class or interface
                cls_match = re.search(r'(?:export\s+)?(?:class|interface|type)\s+([a-zA-Z0-9_]+)', line)
                if cls_match:
                    name = cls_match.group(1)
                    stype = "interface" if "interface" in line else "class"
                    end = cls._find_block_end(lines, i - 1, indent_based=False)
                    symbols.append(ParsedSymbol(
                        name=name, symbol_type=stype, file_path=file_path,
                        start_line=i, end_line=end, signature=line.strip(), parsing_method="regex"
                    ))

                # JS/TS imports
                if line.strip().startswith("import "):
                    imports.append(line.strip())

        return symbols, imports

    @staticmethod
    def _find_block_end(lines: List[str], start_idx: int, indent_based: bool) -> int:
        """Find the closing line number of a code block."""
        if start_idx >= len(lines):
            return start_idx + 1

        if indent_based:
            base_indent = len(lines[start_idx]) - len(lines[start_idx].lstrip())
            for idx in range(start_idx + 1, len(lines)):
                line = lines[idx]
                if not line.strip():
                    continue
                indent = len(line) - len(line.lstrip())
                if indent <= base_indent:
                    return idx
            return len(lines)
        else:
            brace_count = 0
            found_brace = False
            for idx in range(start_idx, len(lines)):
                line = lines[idx]
                brace_count += line.count('{') - line.count('}')
                if '{' in line:
                    found_brace = True
                if found_brace and brace_count <= 0:
                    return idx + 1
            return min(start_idx + 50, len(lines))

    @classmethod
    def create_code_chunks(
        cls,
        file_path: str,
        file_name: str,
        content: str,
        language: str,
        symbols: List[ParsedSymbol]
    ) -> List[ParsedChunk]:
        """Create code-aware semantic chunks using symbols or sliding boundary window."""
        chunks: List[ParsedChunk] = []
        lines = content.splitlines()
        if not lines:
            return chunks

        # If symbols exist, chunk by extracted symbols + remaining blocks
        if symbols:
            chunk_idx = 0
            for sym in symbols:
                if sym.start_line <= len(lines):
                    end = min(sym.end_line, len(lines))
                    sym_content = "\n".join(lines[sym.start_line - 1:end])
                    if sym_content.strip():
                        chunks.append(ParsedChunk(
                            chunk_index=chunk_idx,
                            file_path=file_path,
                            file_name=file_name,
                            content=sym_content,
                            language=language,
                            metadata={
                                "symbol_name": sym.name,
                                "symbol_type": sym.symbol_type,
                                "start_line": sym.start_line,
                                "end_line": end,
                                "parsing_method": sym.parsing_method
                            }
                        ))
                        chunk_idx += 1
            if chunks:
                return chunks

        # Fallback: Sliding window chunking with boundary awareness (40 lines per chunk, 10 overlap)
        chunk_idx = 0
        window_size = 40
        overlap = 10
        total_lines = len(lines)

        start = 0
        while start < total_lines:
            end = min(start + window_size, total_lines)
            chunk_lines = lines[start:end]
            chunk_content = "\n".join(chunk_lines)
            if chunk_content.strip():
                chunks.append(ParsedChunk(
                    chunk_index=chunk_idx,
                    file_path=file_path,
                    file_name=file_name,
                    content=chunk_content,
                    language=language,
                    metadata={
                        "start_line": start + 1,
                        "end_line": end,
                        "parsing_method": "text"
                    }
                ))
                chunk_idx += 1
            start += (window_size - overlap)

        return chunks
