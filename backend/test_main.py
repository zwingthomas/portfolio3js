"""Behavioral tests for the ghost replay API.

These run against the in-memory backend (GHOSTS_BACKEND=memory) so no GCP
credentials are needed. The build loop can expand these.

Run with:  cd backend && pip install -r requirements.txt pytest httpx && pytest
"""

import importlib
import os

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client():
    # Force the in-memory backend and a fresh module import so module-level
    # config (backend selection, store singleton) reflects the env.
    os.environ["GHOSTS_BACKEND"] = "memory"
    os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:5173")

    import main as main_module

    main_module = importlib.reload(main_module)
    # Reset the store singleton in case another test populated it.
    main_module._store = None
    return TestClient(main_module.app)


def test_healthz(client):
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_post_then_get_round_trip(client):
    payload = {
        "sessionId": "anon-uuid-123",
        "startedAt": 1719446400000,
        "path": [
            {"t": 0, "x": 0.0, "y": 1.5, "z": 0.0, "ry": 0.0},
            {"t": 33, "x": 0.1, "y": 1.5, "z": -0.2, "ry": 0.05},
        ],
    }
    post = client.post("/ghosts", json=payload)
    assert post.status_code == 201
    created = post.json()
    assert "id" in created and created["id"]

    get = client.get("/ghosts", params={"sinceDays": 30, "limit": 50})
    assert get.status_code == 200
    ghosts = get.json()
    assert len(ghosts) == 1

    ghost = ghosts[0]
    assert ghost["id"] == created["id"]
    assert ghost["startedAt"] == payload["startedAt"]
    assert isinstance(ghost["createdAt"], int) and ghost["createdAt"] > 0
    assert len(ghost["path"]) == 2
    assert ghost["path"][1]["x"] == pytest.approx(0.1)

    # Privacy: no PII / no sessionId leaks out of the GET response.
    assert "sessionId" not in ghost
    assert "expiresAt" not in ghost


def test_oversized_path_rejected(client):
    too_long = [
        {"t": i, "x": 0.0, "y": 0.0, "z": 0.0, "ry": 0.0} for i in range(3001)
    ]
    resp = client.post(
        "/ghosts",
        json={"sessionId": "anon", "startedAt": 0, "path": too_long},
    )
    assert resp.status_code == 413


def test_unknown_fields_stripped(client):
    # Extra client fields (e.g. a stray ip) must never be persisted.
    resp = client.post(
        "/ghosts",
        json={
            "sessionId": "anon",
            "startedAt": 0,
            "ip": "203.0.113.7",
            "userAgent": "should-be-ignored",
            "path": [{"t": 0, "x": 0, "y": 0, "z": 0, "ry": 0, "extra": "nope"}],
        },
    )
    assert resp.status_code == 201

    ghost = client.get("/ghosts").json()[0]
    assert set(ghost.keys()) == {"id", "startedAt", "createdAt", "path"}
    assert set(ghost["path"][0].keys()) == {"t", "x", "y", "z", "ry"}
