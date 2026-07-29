"""
Tests for the self-learning ETA service.

The crown jewel of this service is the *activation gate*: a model must never go
live until it has learned from enough of an organization's real visits AND
proven accurate on that org's own held-out data. These tests pin that
behaviour, plus the honest "no model yet" fallback and request validation.
"""
import uuid

import numpy as np
import pytest
from fastapi.testclient import TestClient

import app as app_module

client = TestClient(app_module.app)


def org_id() -> str:
    """A fresh org per test so models never leak between tests."""
    return uuid.uuid4().hex[:24]


def sample(pos, counters, avg, wait, hour=10, day=2, priority=False):
    return {
        "queuePosition": pos,
        "hourOfDay": hour,
        "dayOfWeek": day,
        "isPriority": priority,
        "avgServiceSeconds": avg,
        "openCounters": counters,
        "actualWaitSeconds": wait,
    }


def learnable_samples(n=200, seed=7):
    """
    Real-shaped history with a genuine signal: the wait is the work ahead of you
    shared across open counters. A model trained on this should predict it well.
    """
    rng = np.random.default_rng(seed)
    out = []
    for _ in range(n):
        pos = int(rng.integers(1, 13))
        counters = int(rng.integers(1, 4))
        avg = 300.0
        wait = ((pos - 1) * avg) / counters
        out.append(sample(pos, counters, avg, wait, hour=int(rng.integers(8, 19)), day=int(rng.integers(0, 7))))
    return out


def noise_samples(n=200, seed=11):
    """History with no learnable relationship — the gate must refuse this."""
    rng = np.random.default_rng(seed)
    out = []
    for _ in range(n):
        pos = int(rng.integers(1, 13))
        counters = int(rng.integers(1, 4))
        out.append(sample(pos, counters, 300.0, float(rng.uniform(0, 10000))))
    return out


def test_health_ok():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_predict_without_a_trained_model_is_honest():
    """No model for this org => say so, don't invent a number."""
    r = client.post("/predict", json={
        "orgId": org_id(), "queuePosition": 4, "hourOfDay": 10,
        "dayOfWeek": 2, "isPriority": False, "avgServiceSeconds": 300, "openCounters": 2,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["trained"] is False
    assert body["source"] == "none"
    assert body["etaSeconds"] is None


def test_training_below_minimum_samples_does_not_activate():
    """Too little real history => keep collecting, stay on the heuristic."""
    oid = org_id()
    r = client.post("/train", json={"orgId": oid, "samples": learnable_samples(n=10)})
    assert r.status_code == 200
    body = r.json()
    assert body["trained"] is False
    assert body["active"] is False
    assert body["sampleCount"] == 10
    assert "collecting" in body["reason"].lower()


def test_accurate_model_activates_and_then_serves_predictions():
    """Enough real visits + accurate on holdout => the model goes live."""
    oid = org_id()
    r = client.post("/train", json={"orgId": oid, "samples": learnable_samples()})
    assert r.status_code == 200
    body = r.json()
    assert body["trained"] is True
    assert body["active"] is True, f"expected activation, got: {body}"
    assert body["accuracy"] >= app_module.ACCURACY_THRESHOLD

    # Now predictions come from the org's own model.
    p = client.post("/predict", json={
        "orgId": oid, "queuePosition": 5, "hourOfDay": 10,
        "dayOfWeek": 2, "isPriority": False, "avgServiceSeconds": 300, "openCounters": 2,
    })
    assert p.status_code == 200
    pb = p.json()
    assert pb["trained"] is True
    assert pb["source"] == "model"
    assert pb["etaSeconds"] >= 0

    # And the model is reported as active for that org only.
    s = client.get("/model-status", params={"orgId": oid})
    assert s.json()["active"] is True
    assert client.get("/model-status", params={"orgId": org_id()}).json()["active"] is False


def test_inaccurate_model_is_refused():
    """Unpredictable history => never activate a model we can't back up."""
    oid = org_id()
    body = client.post("/train", json={"orgId": oid, "samples": noise_samples()}).json()
    assert body["trained"] is True
    assert body["active"] is False
    assert body["accuracy"] < app_module.ACCURACY_THRESHOLD
    # Predictions stay unavailable, so the backend keeps using its heuristic.
    assert client.post("/predict", json={
        "orgId": oid, "queuePosition": 3, "hourOfDay": 9,
        "dayOfWeek": 1, "isPriority": False, "avgServiceSeconds": 300, "openCounters": 1,
    }).json()["trained"] is False


def test_one_orgs_model_never_serves_another_org():
    """Learning is tenant-isolated: org B must not inherit org A's model."""
    a, b = org_id(), org_id()
    assert client.post("/train", json={"orgId": a, "samples": learnable_samples()}).json()["active"] is True
    assert client.post("/predict", json={
        "orgId": b, "queuePosition": 5, "hourOfDay": 10,
        "dayOfWeek": 2, "isPriority": False, "avgServiceSeconds": 300, "openCounters": 2,
    }).json()["trained"] is False


@pytest.mark.parametrize("payload", [
    {},                                                     # nothing at all
    {"queuePosition": -1, "hourOfDay": 10, "dayOfWeek": 2,  # position out of range
     "avgServiceSeconds": 300, "openCounters": 1},
    {"queuePosition": 3, "hourOfDay": 99, "dayOfWeek": 2,   # impossible hour
     "avgServiceSeconds": 300, "openCounters": 1},
    {"queuePosition": 3, "hourOfDay": 10, "dayOfWeek": 2,   # zero service time
     "avgServiceSeconds": 0, "openCounters": 1},
])
def test_malformed_predict_requests_are_rejected_loudly(payload):
    """
    Pydantic validation is what stops a contract mismatch from silently
    producing a wrong ETA — it must 422, not guess.
    """
    assert client.post("/predict", json=payload).status_code == 422
