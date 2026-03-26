# Correctness Gate Fixtures

These fixtures are meant to support Phase 5 hardening:

- Valid code examples for Python and Go
- Syntax-broken examples for Python and Go
- Intentionally misleading “quick scan” snippets (regex-based false positives)

Suggested usage (manual):
- Upload the file contents in the UI under the corresponding language
- Confirm the `Correctness Gate` shows `Pass` for valid fixtures and `Fail` for syntax-broken fixtures
- Confirm misleading “quick scan” snippets can change structural metrics while correctness remains separate

