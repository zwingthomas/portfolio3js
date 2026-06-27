"""Ghost replay backend.

A small FastAPI service that stores ANONYMOUS visitor session paths and serves
recent ones, so the portfolio frontend can replay "ghosts" of past visitors from
the last 30 days.

Privacy model (hard requirement):
  - Fully anonymous. The client generates a random anonymous ``sessionId``
    (a client-side UUID). There is no login.
  - The server stores NO IP address, NO user-agent, and NO PII of any kind.
  - Each ghost document carries a 30-day TTL via an ``expiresAt`` timestamp.
    Configure a Firestore TTL policy on ``expiresAt`` so docs auto-delete
    (see README.md).

Backends:
  - ``GHOSTS_BACKEND=firestore`` (default): uses google-cloud-firestore.
  - ``GHOSTS_BACKEND=memory``: in-process dict store, for local dev without GCP.

The Firestore client is lazily initialized so importing this module never
crashes when credentials are absent (e.g. during tests or in the memory
backend).
"""

from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# --------------------------------------------------------------------------- #
# Configuration                                                               #
# --------------------------------------------------------------------------- #

# Maximum frames we will accept / persist for a single ghost path. Anything
# longer is rejected as an oversized payload.
MAX_FRAMES = 3000

# Ghost documents live for 30 days, then are removed by the Firestore TTL
# policy (or by the memory backend's own expiry sweep).
TTL_DAYS = 30

# Default lookback / page size for the list endpoint.
DEFAULT_SINCE_DAYS = 30
DEFAULT_LIMIT = 50
MAX_LIMIT = 200
MAX_SINCE_DAYS = 30


def _allowed_origins() -> List[str]:
    """Origins allowed by CORS, configurable via ALLOWED_ORIGINS (comma-sep)."""
    raw = os.environ.get(
        "ALLOWED_ORIGINS",
        "https://zwingthomas.github.io,http://localhost:5173",
    )
    return [o.strip() for o in raw.split(",") if o.strip()]


GHOSTS_COLLECTION = os.environ.get("GHOSTS_COLLECTION", "ghosts")
GHOSTS_BACKEND = os.environ.get("GHOSTS_BACKEND", "firestore").strip().lower()
FIRESTORE_PROJECT = os.environ.get("FIRESTORE_PROJECT")


# --------------------------------------------------------------------------- #
# Models                                                                      #
# --------------------------------------------------------------------------- #


class Frame(BaseModel):
    """A single sampled pose along a visitor's path."""

    model_config = {"extra": "ignore"}

    t: int = Field(..., ge=0, description="Milliseconds offset from startedAt.")
    x: float
    y: float
    z: float
    ry: float = Field(0.0, description="Y-axis rotation (heading) in radians.")


class GhostCreate(BaseModel):
    """Request body for POST /ghosts."""

    model_config = {"extra": "ignore"}

    sessionId: str = Field(..., min_length=1, max_length=64)
    startedAt: int = Field(..., ge=0, description="Epoch milliseconds.")
    path: List[Frame] = Field(default_factory=list)


class GhostCreated(BaseModel):
    id: str


class GhostOut(BaseModel):
    """A ghost as returned by GET /ghosts. Contains no PII."""

    id: str
    startedAt: int
    createdAt: int
    path: List[Frame]


# --------------------------------------------------------------------------- #
# Storage backends                                                            #
# --------------------------------------------------------------------------- #


def _now_ms() -> int:
    return int(time.time() * 1000)


def _now_dt() -> datetime:
    return datetime.now(timezone.utc)


class GhostStore:
    """Abstract storage interface."""

    def create(self, doc: dict) -> str:  # pragma: no cover - interface
        raise NotImplementedError

    def recent(self, since_dt: datetime, limit: int) -> List[dict]:  # pragma: no cover
        raise NotImplementedError


class MemoryStore(GhostStore):
    """In-process store for local dev / tests (GHOSTS_BACKEND=memory)."""

    def __init__(self) -> None:
        self._docs: dict[str, dict] = {}
        self._lock = Lock()

    def _sweep_expired(self, now: Optional[datetime] = None) -> None:
        now = now or _now_dt()
        expired = [
            doc_id
            for doc_id, doc in self._docs.items()
            if doc.get("expiresAt") and doc["expiresAt"] <= now
        ]
        for doc_id in expired:
            self._docs.pop(doc_id, None)

    def create(self, doc: dict) -> str:
        doc_id = uuid.uuid4().hex
        with self._lock:
            self._sweep_expired()
            self._docs[doc_id] = doc
        return doc_id

    def recent(self, since_dt: datetime, limit: int) -> List[dict]:
        with self._lock:
            self._sweep_expired()
            items = [
                {**doc, "id": doc_id}
                for doc_id, doc in self._docs.items()
                if doc.get("createdAt") and doc["createdAt"] >= since_dt
            ]
        items.sort(key=lambda d: d["createdAt"], reverse=True)
        return items[:limit]


class FirestoreStore(GhostStore):
    """Firestore-backed store. The client is created lazily on first use."""

    def __init__(self) -> None:
        self._client = None
        self._lock = Lock()

    def _get_client(self):
        if self._client is None:
            with self._lock:
                if self._client is None:
                    # Imported lazily so the module imports cleanly without the
                    # dependency / credentials present.
                    from google.cloud import firestore  # type: ignore

                    if FIRESTORE_PROJECT:
                        self._client = firestore.Client(project=FIRESTORE_PROJECT)
                    else:
                        self._client = firestore.Client()
        return self._client

    def create(self, doc: dict) -> str:
        client = self._get_client()
        ref = client.collection(GHOSTS_COLLECTION).document()
        ref.set(doc)
        return ref.id

    def recent(self, since_dt: datetime, limit: int) -> List[dict]:
        from google.cloud import firestore  # type: ignore

        client = self._get_client()
        query = (
            client.collection(GHOSTS_COLLECTION)
            .where("createdAt", ">=", since_dt)
            .order_by("createdAt", direction=firestore.Query.DESCENDING)
            .limit(limit)
        )
        results = []
        for snap in query.stream():
            data = snap.to_dict() or {}
            data["id"] = snap.id
            results.append(data)
        return results


_store: Optional[GhostStore] = None
_store_lock = Lock()


def get_store() -> GhostStore:
    """Return the configured store, instantiating it once."""
    global _store
    if _store is None:
        with _store_lock:
            if _store is None:
                if GHOSTS_BACKEND == "memory":
                    _store = MemoryStore()
                else:
                    _store = FirestoreStore()
    return _store


# --------------------------------------------------------------------------- #
# Serialization helpers                                                       #
# --------------------------------------------------------------------------- #


def _to_ms(value) -> int:
    """Coerce a stored timestamp (datetime or epoch-ms int) to epoch ms."""
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return int(value.timestamp() * 1000)
    if isinstance(value, (int, float)):
        return int(value)
    return 0


def _frame_to_dict(frame: Frame) -> dict:
    return {
        "t": frame.t,
        "x": frame.x,
        "y": frame.y,
        "z": frame.z,
        "ry": frame.ry,
    }


def _doc_to_out(doc: dict) -> GhostOut:
    raw_path = doc.get("path") or []
    path = [Frame(**f) for f in raw_path]
    return GhostOut(
        id=doc["id"],
        startedAt=int(doc.get("startedAt", 0)),
        createdAt=_to_ms(doc.get("createdAt")),
        path=path,
    )


# --------------------------------------------------------------------------- #
# App                                                                         #
# --------------------------------------------------------------------------- #

app = FastAPI(title="Ghost Replay API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}


@app.post("/ghosts", response_model=GhostCreated, status_code=201)
def create_ghost(body: GhostCreate) -> GhostCreated:
    # Reject oversized payloads. Pydantic has already stripped unknown fields.
    if len(body.path) > MAX_FRAMES:
        raise HTTPException(
            status_code=413,
            detail=f"path too long: {len(body.path)} > {MAX_FRAMES} frames",
        )

    now = _now_dt()
    expires_at = now + timedelta(days=TTL_DAYS)

    # Store ONLY these fields. No IP, no user-agent, no headers, no PII.
    doc = {
        "sessionId": body.sessionId,
        "startedAt": body.startedAt,
        "path": [_frame_to_dict(f) for f in body.path],
        "createdAt": now,
        "expiresAt": expires_at,
    }

    doc_id = get_store().create(doc)
    return GhostCreated(id=doc_id)


@app.get("/ghosts", response_model=List[GhostOut])
def list_ghosts(
    sinceDays: int = Query(DEFAULT_SINCE_DAYS, ge=1, le=MAX_SINCE_DAYS),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
) -> List[GhostOut]:
    since_dt = _now_dt() - timedelta(days=sinceDays)
    docs = get_store().recent(since_dt, limit)
    return [_doc_to_out(d) for d in docs]
