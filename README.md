# ATLAS — Enterprise Knowledge Intelligence Platform

> Turn disconnected information into connected intelligence.

ATLAS turns business documents such as contracts, financial reports and policies into a **knowledge graph**. It then answers questions that span several documents by combining **vector search** with **graph traversal (GraphRAG)**. Every answer is backed by citations and the relationships used to reach it.

*Example:* "Which projects are at risk if Vendor Alpha fails to deliver, and do any have contracts expiring soon?" The answer connects facts from four separate documents.

> 🚧 In active development. Multi-tenant accounts and the document ingestion pipeline are complete; the knowledge graph and GraphRAG engine are being built now.

## Highlights

- **Multi-tenant SaaS architecture:** organizations, workspaces and role-based access (Owner / Admin / Editor / Viewer), enforced on the backend across PostgreSQL, Neo4j and Qdrant
- **Secure authentication:** bcrypt, JWT in httpOnly cookies, token revocation, rate limiting and email-bound invitation links
- **Asynchronous ingestion pipeline:** PDF, DOCX, TXT and Markdown are validated, extracted, cleaned, chunked with source offsets and embedded into Qdrant by a background worker, with live progress, retries and clean deletion
- **GraphRAG engine** *(in progress):* Standard RAG, GraphRAG and Hybrid retrieval, with a lab that compares the three on the same questions
- **Polished product UI:** custom design system, animated interactions, responsive layout
- **Tested:** integration tests cover authentication, permissions, ingestion and tenant isolation

## Tech stack

**Frontend:** React · TypeScript · Vite · Tailwind CSS · Framer Motion · React Query
**Backend:** Python · FastAPI · SQLAlchemy · Alembic · Pydantic
**Data:** PostgreSQL · Neo4j (graph) · Qdrant (vectors) · Redis
**AI:** Gemini (swappable provider layer) · **Infra:** Docker Compose

## Run locally

Requires Docker and Node.js 20+.

```bash
cp .env.example .env            # set JWT_SECRET (and GEMINI_API_KEY)
docker compose up -d --build    # databases, API and background worker
cd frontend && npm install && npm run dev
```

Open http://localhost:5180. API docs are at http://localhost:8010/docs. A fictional sample corpus to upload is in [`sample_data/`](sample_data/).

Run the tests with `docker compose exec backend pytest`.
