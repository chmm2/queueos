# FastAPI ETA prediction service
FROM python:3.14-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# No model is baked in — the service starts empty and learns each org's model
# from that org's own real completed visits (see /train). Trained models are
# persisted under ./models at runtime.
# Honour the platform-injected PORT (Render/Fly/etc.), default 6000 locally.
ENV PORT=6000
EXPOSE 6000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD python -c "import os,urllib.request,sys; p=os.environ.get('PORT','6000'); sys.exit(0) if urllib.request.urlopen(f'http://localhost:{p}/health').status==200 else sys.exit(1)"

# Shell form so ${PORT} is expanded at runtime.
CMD uvicorn app:app --host 0.0.0.0 --port ${PORT}
