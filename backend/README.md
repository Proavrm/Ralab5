# File: backend/README.md
# Description: Backend handoff for the RaLab4 transition package.

`current_fastapi/` contains the live FastAPI logic extracted from the current RaLab3 base.

Use it as the functional baseline.
Do not rewrite everything at once.

Migration rule:
- Preserve the current working API behavior first.
- Extract and reorganize progressively into the final RaLab4 structure.
- Keep code comments in English and keep a file header comment at the top of every new file.
