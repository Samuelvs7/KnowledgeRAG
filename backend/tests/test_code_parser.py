import unittest
from services.code_parser import CodeParserService, ParsedSymbol, ParsedFile


class TestCodeParser(unittest.TestCase):

    def test_should_ignore_rules(self):
        """Verify that vendor, build, git, and binary directories are filtered."""
        self.assertTrue(CodeParserService.should_ignore("node_modules/express/index.js"))
        self.assertTrue(CodeParserService.should_ignore(".git/config"))
        self.assertTrue(CodeParserService.should_ignore("dist/bundle.js"))
        self.assertTrue(CodeParserService.should_ignore("__pycache__/app.cpython-311.pyc"))
        self.assertTrue(CodeParserService.should_ignore("image.png"))
        self.assertTrue(CodeParserService.should_ignore("archive.zip"))

        # Valid source files should NOT be ignored
        self.assertFalse(CodeParserService.should_ignore("src/components/Header.tsx"))
        self.assertFalse(CodeParserService.should_ignore("backend/routers/codebase.py"))
        self.assertFalse(CodeParserService.should_ignore("main.go"))

    def test_language_detection(self):
        """Verify language detection across standard extensions."""
        self.assertEqual(CodeParserService.detect_language("src/App.tsx"), "typescript")
        self.assertEqual(CodeParserService.detect_language("server/index.js"), "javascript")
        self.assertEqual(CodeParserService.detect_language("backend/main.py"), "python")
        self.assertEqual(CodeParserService.detect_language("cmd/main.go"), "go")
        self.assertEqual(CodeParserService.detect_language("src/lib.rs"), "rust")
        self.assertEqual(CodeParserService.detect_language("Dockerfile"), "dockerfile")

    def test_binary_content_detection(self):
        """Verify detection of raw binary bytes vs UTF-8 text."""
        text_data = b"def hello_world():\n    print('Hello World')\n"
        binary_data = b"\x7fELF\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00"

        self.assertFalse(CodeParserService.is_binary_content(text_data))
        self.assertTrue(CodeParserService.is_binary_content(binary_data))

    def test_content_hashing(self):
        """Verify SHA-256 content hashing for incremental indexing."""
        content1 = "def fn(): pass"
        content2 = "def fn(): pass"
        content3 = "def fn(): return 42"

        hash1 = CodeParserService.compute_content_hash(content1)
        hash2 = CodeParserService.compute_content_hash(content2)
        hash3 = CodeParserService.compute_content_hash(content3)

        self.assertEqual(hash1, hash2)
        self.assertNotEqual(hash1, hash3)
        self.assertEqual(len(hash1), 64)

    def test_python_symbol_parsing(self):
        """Verify symbol and chunk extraction for Python source code."""
        python_code = """import os
from typing import List

class UserStore:
    def __init__(self, db_url: str):
        self.db_url = db_url

    def get_user(self, user_id: str) -> dict:
        return {"id": user_id}

def top_level_function():
    return True
"""
        parsed = CodeParserService.parse_file_content(
            file_path="services/user_store.py",
            content=python_code,
            language="python",
            content_hash=CodeParserService.compute_content_hash(python_code),
            file_size=len(python_code),
            line_count=len(python_code.splitlines()),
            content_stored=True,
            stored_content=python_code
        )

        self.assertEqual(parsed.file_path, "services/user_store.py")
        self.assertGreaterEqual(len(parsed.symbols), 3)
        names = [s.name for s in parsed.symbols]
        self.assertIn("UserStore", names)
        self.assertIn("get_user", names)
        self.assertIn("top_level_function", names)
        self.assertEqual(len(parsed.imports), 2)
        self.assertGreaterEqual(len(parsed.chunks), 1)

    def test_typescript_symbol_parsing(self):
        """Verify symbol and chunk extraction for TypeScript source code."""
        ts_code = """import { useState } from 'react';

export interface UserProfile {
    id: string;
    email: string;
}

export function ProfileHeader(props: UserProfile) {
    return <h1>{props.email}</h1>;
}
"""
        parsed = CodeParserService.parse_file_content(
            file_path="src/components/ProfileHeader.tsx",
            content=ts_code,
            language="typescript",
            content_hash=CodeParserService.compute_content_hash(ts_code),
            file_size=len(ts_code),
            line_count=len(ts_code.splitlines()),
            content_stored=True,
            stored_content=ts_code
        )

        self.assertEqual(parsed.file_name, "ProfileHeader.tsx")
        self.assertGreaterEqual(len(parsed.symbols), 2)
        names = [s.name for s in parsed.symbols]
        self.assertIn("UserProfile", names)
        self.assertIn("ProfileHeader", names)
        self.assertEqual(len(parsed.imports), 1)


if __name__ == "__main__":
    unittest.main()
