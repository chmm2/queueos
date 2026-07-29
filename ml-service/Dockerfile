# FastAPI ETA prediction service
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# No model is baked in — the service starts empty and learns each org's model
# from that org's own real completed visits (see /train). Trained models are
# persisted under ./models at runtime.
EXPOSE 6000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD python -c "import urllib.request,sys; sys.exit(0) if urllib.request.urlopen('http://localhost:6000/health').status==200 else sys.exit(1)"

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "6000"]
