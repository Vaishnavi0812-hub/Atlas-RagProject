# ATLAS — Enterprise Knowledge Intelligence Platform

> Turn disconnected information into connected intelligence.

ATLAS turns enterprise documents (contracts, financial statements, policies, technical specifications) into a knowledge graph. It answers multi-hop business questions by combining vector retrieval with graph traversal, and every answer is backed by citations and relationship evidence.

## Architecture

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS, Framer Motion, React Query | Application UI |
| API | FastAPI, Pydantic, SQLAlchemy (async), Alembic | REST API, auth, orchestration |
| Relational store | PostgreSQL | Users, organizations, workspaces, documents, conversations, jobs, analytics |
| Graph store | Neo4j | Entities, relationships, provenance, traversal |
| Vector store | Qdrant | Chunk embeddings, tenant-filtered semantic search |
| Queue / cache | Redis | Background processing, job coordination, caching |
| AI | Gemini (behind a provider abstraction) | Extraction, embeddings, answer generation |

Tenant isolation is enforced in every store. PostgreSQL rows, Qdrant payloads and Neo4j nodes all carry `organization_id` and `workspace_id`, and the backend scopes every query by them.

## Getting started

Prerequisites: Docker Desktop and Node.js 20+.

```bash
# 1. Configure environment
cp .env.example .env          # then set JWT_SECRET (and GEMINI_API_KEY from Stage 3)

# 2. Start datastores + API (runs migrations automatically)
docker compose up -d --build

# 3. Start the frontend
cd frontend
npm install
npm run dev
```

| Service | URL |
|---|---|
| Web app | http://localhost:5180 |
| API docs | http://localhost:8010/docs |
| Neo4j browser | http://localhost:7475 |
| Qdrant dashboard | http://localhost:6335/dashboard |

Host ports are configurable in `.env` and were chosen not to clash with other local projects.

### Tests

```bash
docker compose exec backend pytest
```

## Roadmap

- [x] **Stage 1: Foundation.** Docker infrastructure, FastAPI core, Alembic, datastore bootstrap, health checks, design system and application shell
- [ ] **Stage 2: Accounts & tenancy.** Authentication, organizations, invitations, roles, workspaces
- [ ] **Stage 3: Document ingestion.** Upload, background pipeline, chunking, embeddings, document library
- [ ] **Stage 4: Knowledge graph.** LLM entity and relationship extraction, entity resolution, Neo4j graph, graph explorer
- [ ] **Stage 5: GraphRAG engine & chat.** Standard RAG, GraphRAG and Hybrid retrieval; multi-hop QA; streaming chat with citations
- [ ] **Stage 6: Intelligence modules.** Vendor, contract, compliance and financial intelligence; comparison lab; evaluation framework
- [ ] **Stage 7: Analytics & hardening.** Analytics dashboard, security review, polish

## Design

The visual identity is editorial and enterprise in tone. The palette is Graphite `#202124`, Persimmon `#FF7849`, Warm Sand `#F4EFE6`, Cobalt `#4776D0` and Muted Gold `#D6AD64`. Headlines are set in Fraunces, interface text in Instrument Sans, and data labels in JetBrains Mono.
