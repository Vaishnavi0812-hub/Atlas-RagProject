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

## Accounts, organizations and access control

- **Authentication.** Passwords are hashed with bcrypt (SHA-256 pre-hash, so long passphrases count in full). Sessions are JWTs delivered as an `httpOnly`, `SameSite=Lax` cookie; API clients can send `Authorization: Bearer` instead. Logging out revokes that token in Redis, and changing a password invalidates every other session. Login is rate-limited per email and IP.
- **Organizations.** Users can belong to several organizations and switch between them. Invitations are single-use, expire after 7 days, and are bound to the invited email address. Only a SHA-256 hash of each invitation token is stored.
- **Roles.** `owner > admin > editor > viewer`. Members can only manage people at or below their own role, and an organization always keeps at least one owner.
- **Workspaces.** Workspaces are either *organization-wide* (open to every member, who acts with their organization role) or *restricted* (open to admins plus explicitly granted members). A grant never exceeds the member's organization role.
- **Enforcement.** Every check happens in FastAPI dependencies (`app/api/deps.py`). Hiding a button in the UI is never the only safeguard. Requests for another tenant's resources return `404`, so the API never confirms that they exist.
- **Deletion.** Deleting a workspace or organization purges its Qdrant vectors and Neo4j nodes *before* the PostgreSQL rows, so a failure cannot leave orphaned data behind.
- **Audit trail.** Membership, invitation and workspace changes are written to an activity log, filtered by what each viewer is allowed to see.

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

Tests use a separate `atlas_test` database and Redis DB 15, so they never touch development data.
