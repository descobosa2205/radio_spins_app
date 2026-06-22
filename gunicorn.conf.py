import os

# Enlace al puerto que asigna el proveedor (Render expone PORT). SIN esta línea, gunicorn arranca en
# 127.0.0.1:8000 por defecto y Render no detecta el puerto -> "No open ports detected" y el deploy
# falla. Con el bind aquí funciona tanto con `gunicorn app:app` como con `-c gunicorn.conf.py`.
bind = f"0.0.0.0:{os.getenv('PORT', '10000')}"

# Subidas de masters de audio: evita 502 por timeout del worker durante cargas WAV grandes.
workers = int(os.getenv("WEB_CONCURRENCY", "1"))
threads = int(os.getenv("GUNICORN_THREADS", "4"))
worker_class = os.getenv("GUNICORN_WORKER_CLASS", "gthread")
timeout = int(os.getenv("GUNICORN_TIMEOUT", "300"))
graceful_timeout = int(os.getenv("GUNICORN_GRACEFUL_TIMEOUT", "60"))
keepalive = int(os.getenv("GUNICORN_KEEPALIVE", "5"))
