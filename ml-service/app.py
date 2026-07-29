"""
Self-learning ETA microservice (FastAPI).

Principle: NO synthetic data, ever. This service ships with no model. It
learns each organization's wait-time patterns purely from that org's own
completed visits, and only activates a model once it is proven accurate on
the org's own held-out data. Until then the backend uses a transparent
heuristic (position x measured service time / open counters) — see
backend/src/services/etaService.js.

Kept out of the Node process on purpose: Random Forest training/inference is
CPU-bound and must never block the real-time event loop. The Node backend
gathers each org's real completed tokens and POSTs them to /train; it calls
/predict per token with a short timeout and falls back to the heuristic if a
model isn't active yet.
"""
import os
from typing import List, Optional

import joblib
import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel, Field
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split

# Where trained per-org models are persisted. Overridable so tests can use a
# temp dir and deployments can point at a mounted volume.
MODEL_DIR = os.environ.get("MODEL_DIR") or os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODEL_DIR, exist_ok=True)

# Activation gate: a model only goes live once it has learned from enough real
# visits AND predicts them accurately on held-out data. "Accurate" = the
# prediction is within TOLERANCE_SECONDS OR within TOLERANCE_PCT of the actual
# wait — being within 3 min on a 40-min wait should count as a good ETA.
MIN_SAMPLES = int(os.environ.get("ETA_MIN_SAMPLES", "120"))
TOLERANCE_SECONDS = float(os.environ.get("ETA_TOLERANCE_SECONDS", "180"))
TOLERANCE_PCT = float(os.environ.get("ETA_TOLERANCE_PCT", "0.20"))
ACCURACY_THRESHOLD = float(os.environ.get("ETA_ACCURACY_THRESHOLD", "0.7"))

app = FastAPI(title="QueueOS Self-Learning ETA Service", version="2.0.0")

# In-memory registry of active org models: orgId -> {model, meta}. Persisted to
# disk so it survives restarts.
_registry: dict = {}


def _model_path(org_id: str) -> str:
    safe = "".join(c for c in org_id if c.isalnum())
    return os.path.join(MODEL_DIR, f"{safe}.joblib")


def _load_all():
    for fn in os.listdir(MODEL_DIR):
        if fn.endswith(".joblib"):
            try:
                bundle = joblib.load(os.path.join(MODEL_DIR, fn))
                _registry[bundle["orgId"]] = bundle
            except Exception as e:  # pragma: no cover
                print(f"[ml] failed to load {fn}: {e}")


_load_all()


# ---- Feature vector (order matters and must match the backend) --------------
#   [queuePosition, hourOfDay, dayOfWeek, isPriority, avgServiceSeconds, openCounters]
def _row(s) -> list:
    return [s.queuePosition, s.hourOfDay, s.dayOfWeek, 1 if s.isPriority else 0, s.avgServiceSeconds, s.openCounters]


class Sample(BaseModel):
    queuePosition: int = Field(..., ge=0)
    hourOfDay: int = Field(..., ge=0, le=23)
    dayOfWeek: int = Field(..., ge=0, le=6)
    isPriority: bool = False
    avgServiceSeconds: float = Field(..., gt=0)
    openCounters: int = Field(..., ge=1)
    actualWaitSeconds: float = Field(..., ge=0)  # the label, from real history


class TrainRequest(BaseModel):
    orgId: str
    samples: List[Sample]


class TrainResponse(BaseModel):
    orgId: str
    trained: bool
    active: bool
    sampleCount: int
    maeSeconds: Optional[float] = None
    accuracy: Optional[float] = None  # fraction of holdout within tolerance
    reason: str


class PredictRequest(BaseModel):
    orgId: Optional[str] = None
    queuePosition: int = Field(..., ge=0)
    hourOfDay: int = Field(..., ge=0, le=23)
    dayOfWeek: int = Field(..., ge=0, le=6)
    isPriority: bool = False
    avgServiceSeconds: float = Field(..., gt=0)
    openCounters: int = Field(..., ge=1)


class PredictResponse(BaseModel):
    trained: bool          # was a live org model used?
    etaSeconds: Optional[int] = None
    source: str            # 'model' or 'none'


@app.get("/health")
def health():
    return {"status": "ok", "activeModels": len(_registry)}


@app.post("/train", response_model=TrainResponse)
def train(req: TrainRequest):
    """Train (or retrain) an org's model from its OWN real completed visits."""
    n = len(req.samples)
    if n < MIN_SAMPLES:
        return TrainResponse(
            orgId=req.orgId, trained=False, active=False, sampleCount=n,
            reason=f"collecting data ({n}/{MIN_SAMPLES} real visits needed)",
        )

    X = np.array([_row(s) for s in req.samples], dtype=float)
    y = np.array([s.actualWaitSeconds for s in req.samples], dtype=float)

    # Held-out evaluation on the org's own data — this is the accuracy gate.
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, random_state=42)
    model = RandomForestRegressor(n_estimators=200, max_depth=14, random_state=42, n_jobs=-1)
    model.fit(X_tr, y_tr)

    pred = model.predict(X_te)
    err = np.abs(pred - y_te)
    mae = float(np.mean(err))
    # A prediction counts as accurate if it's within an absolute OR a relative
    # band of the true wait.
    tol = np.maximum(TOLERANCE_SECONDS, TOLERANCE_PCT * y_te)
    accuracy = float(np.mean(err <= tol))

    active = accuracy >= ACCURACY_THRESHOLD
    if active:
        # Refit on ALL data for the deployed model now that it's proven.
        model.fit(X, y)
        bundle = {"orgId": req.orgId, "model": model, "mae": mae, "accuracy": accuracy, "sampleCount": n}
        _registry[req.orgId] = bundle
        joblib.dump(bundle, _model_path(req.orgId))
        reason = f"active — {accuracy*100:.0f}% of visits predicted within {int(TOLERANCE_SECONDS)}s"
    else:
        reason = f"not accurate enough yet ({accuracy*100:.0f}% within tolerance, need {int(ACCURACY_THRESHOLD*100)}%)"

    return TrainResponse(
        orgId=req.orgId, trained=True, active=active, sampleCount=n,
        maeSeconds=round(mae), accuracy=round(accuracy, 3), reason=reason,
    )


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    """Predict only if this org has a live, proven model. Otherwise say so and
    let the backend use its heuristic — we never invent a number."""
    bundle = _registry.get(req.orgId) if req.orgId else None
    if not bundle:
        return PredictResponse(trained=False, source="none")

    feats = np.array([[req.queuePosition, req.hourOfDay, req.dayOfWeek,
                       1 if req.isPriority else 0, req.avgServiceSeconds, req.openCounters]], dtype=float)
    eta = max(0, int(round(float(bundle["model"].predict(feats)[0]))))
    return PredictResponse(trained=True, etaSeconds=eta, source="model")


@app.get("/model-status")
def model_status(orgId: str):
    b = _registry.get(orgId)
    if not b:
        return {"orgId": orgId, "active": False}
    return {"orgId": orgId, "active": True, "sampleCount": b["sampleCount"],
            "maeSeconds": round(b["mae"]), "accuracy": round(b["accuracy"], 3)}
