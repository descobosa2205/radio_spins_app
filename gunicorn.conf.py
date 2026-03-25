import os

bind = f"0.0.0.0:{os.getenv('PORT', '10000')}"
workers = int(os.getenv("WEB_CONCURRENCY", "2"))
timeout = int(os.getenv("GUNICORN_TIMEOUT", "60"))
graceful_timeout = int(os.getenv("GUNICORN_GRACEFUL_TIMEOUT", "30"))
max_requests = int(os.getenv("GUNICORN_MAX_REQUESTS", "200"))
max_requests_jitter = int(os.getenv("GUNICORN_MAX_REQUESTS_JITTER", "20"))
