# Ghost Replay API

A tiny [FastAPI](https://fastapi.tiangolo.com/) service that stores **anonymous**
visitor session paths and serves recent ones, so the portfolio frontend can
replay "ghosts" of past visitors from the last 30 days.

Stack mirrors the owner's Traxy `fastapi-api` conventions:
FastAPI + Pydantic v2 + `google-cloud-firestore`, deployed to Cloud Run.

> The React frontend is **not** wired to this service yet. That happens in
> milestone **M8** (owned by the build loop). This directory is the service
> plus the request/response contract only.

---

## Privacy model (hard requirement)

This service is designed to be **fully anonymous**:

- The client generates a random anonymous `sessionId` (a client-side UUID).
  There is **no login** and no account.
- The server stores **NO IP address, NO user-agent, NO PII** of any kind.
  Each ghost doc contains only:
  `{ sessionId, startedAt, path, createdAt, expiresAt }`.
- Every ghost doc carries a **30-day TTL** via the `expiresAt` timestamp.
  A Firestore TTL policy on `expiresAt` deletes docs automatically
  (see [Firestore TTL setup](#firestore-ttl-setup)). The in-memory dev backend
  enforces the same expiry on read/write.
- Pydantic models use `extra="ignore"`, so any unexpected client fields are
  silently dropped rather than persisted.

---

## Endpoints / frontend contract

### `GET /healthz`

```json
{ "status": "ok" }
```

### `POST /ghosts`

Request body (`GhostCreate`):

```json
{
  "sessionId": "1f2e3d4c5b6a7890",
  "startedAt": 1719446400000,
  "path": [
    { "t": 0,    "x": 0.0, "y": 1.5, "z": 0.0,  "ry": 0.0 },
    { "t": 33,   "x": 0.1, "y": 1.5, "z": -0.2, "ry": 0.05 }
  ]
}
```

- `sessionId` — anonymous client UUID, 1–64 chars.
- `startedAt` — epoch **milliseconds** when the session began.
- `path` — list of `Frame`s, each `{ t, x, y, z, ry }`:
  - `t` — millisecond offset from `startedAt` (>= 0).
  - `x`, `y`, `z` — world position (floats).
  - `ry` — Y-axis heading in radians (float, defaults to 0).
- The path is capped at **3000 frames**; longer payloads are rejected with
  `413 Request Entity Too Large`.

Response (`201 Created`):

```json
{ "id": "generated-doc-id" }
```

### `GET /ghosts?sinceDays=30&limit=50`

Returns recent ghosts, most recent first. No PII is returned.

- `sinceDays` — lookback window, `1..30` (default `30`).
- `limit` — page size, `1..200` (default `50`).

Response (`200 OK`):

```json
[
  {
    "id": "doc-id",
    "startedAt": 1719446400000,
    "createdAt": 1719446405123,
    "path": [ { "t": 0, "x": 0.0, "y": 1.5, "z": 0.0, "ry": 0.0 } ]
  }
]
```

> Note: `sessionId` is intentionally **not** returned by `GET /ghosts`.

### CORS

Allowed origins default to `https://zwingthomas.github.io` (GitHub Pages) and
`http://localhost:5173` (Vite dev). Override with the `ALLOWED_ORIGINS`
environment variable (comma-separated).

---

## Configuration

All configuration is via environment variables (see `.env.example`):

| Variable            | Default                                                       | Description                                   |
| ------------------- | ------------------------------------------------------------- | --------------------------------------------- |
| `FIRESTORE_PROJECT` | _(unset → client default)_                                    | GCP project that owns the Firestore database. |
| `GHOSTS_COLLECTION` | `ghosts`                                                      | Firestore collection name.                    |
| `ALLOWED_ORIGINS`   | `https://zwingthomas.github.io,http://localhost:5173`         | Comma-separated CORS origins.                 |
| `GHOSTS_BACKEND`    | `firestore`                                                  | `firestore` (prod) or `memory` (local dev).   |
| `PORT`              | `8080`                                                       | Injected by Cloud Run; used by the container. |

---

## Run locally (no GCP required)

The `memory` backend keeps ghosts in process, so you can run the whole service
without any Google Cloud credentials:

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

GHOSTS_BACKEND=memory uvicorn main:app --reload --port 8080
```

Then:

```bash
curl localhost:8080/healthz
# {"status":"ok"}

curl -X POST localhost:8080/ghosts \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"abc123","startedAt":0,"path":[{"t":0,"x":0,"y":0,"z":0,"ry":0}]}'
# {"id":"..."}

curl 'localhost:8080/ghosts?sinceDays=30&limit=50'
```

### Run the tests

```bash
cd backend
pip install -r requirements.txt pytest httpx
pytest
```

---

## Deploy to Cloud Run

From the `backend/` directory (source-based deploy builds the image for you):

`ALLOWED_ORIGINS` is itself comma-separated, so we use gcloud's custom
delimiter syntax (`^@^`) to avoid gcloud splitting that value on its commas:

```bash
gcloud run deploy ghost-replay-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "^@^GHOSTS_BACKEND=firestore@GHOSTS_COLLECTION=ghosts@FIRESTORE_PROJECT=YOUR_PROJECT_ID@ALLOWED_ORIGINS=https://zwingthomas.github.io,http://localhost:5173"
```

The container reads `PORT` (Cloud Run injects it) and binds `0.0.0.0`.

The Cloud Run service account needs Firestore access, e.g.
`roles/datastore.user` on the project.

---

## Firestore TTL setup

Ghost docs are written with an `expiresAt` timestamp 30 days in the future.
Enable a TTL policy so Firestore deletes them automatically:

```bash
gcloud firestore fields ttls update expiresAt \
  --collection-group=ghosts \
  --enable-ttl \
  --project=YOUR_PROJECT_ID
```

To inspect or disable later:

```bash
# View current TTL config for the field
gcloud firestore fields ttls list --collection-group=ghosts --project=YOUR_PROJECT_ID

# Disable
gcloud firestore fields ttls update expiresAt \
  --collection-group=ghosts --disable-ttl --project=YOUR_PROJECT_ID
```

> Firestore TTL deletion is best-effort and may lag the exact `expiresAt`
> instant by up to ~24h. The `GET /ghosts` query additionally filters by
> `createdAt >= now - sinceDays`, so expired-but-not-yet-swept docs are never
> returned to the frontend.

### Index note

The `GET /ghosts` query filters on `createdAt` and orders by `createdAt`
(descending). A single-field index (created by default for every field) is
sufficient; no composite index is required.
