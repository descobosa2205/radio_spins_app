import os

# Enlace al puerto que asigna el proveedor (Render expone PORT). SIN esta línea, gunicorn arranca en
# 127.0.0.1:8000 por defecto y Render no detecta el puerto -> "No open ports detected" y el deploy
# falla. Con el bind aquí funciona tanto con `gunicorn app:app` como con `-c gunicorn.conf.py`.
bind = f"0.0.0.0:{os.getenv('PORT', '10000')}"

# Subidas de masters de audio: evita 502 por timeout del worker durante cargas WAV grandes.
# CONCURRENCIA: con 1 worker × 4 hilos, unas pocas peticiones pesadas (páginas de invitaciones,
# refrescos en 2º plano, PDFs) saturaban el servidor y TODO lo demás quedaba en cola — la app
# entera parecía «congelada». Por defecto 2 workers × 8 hilos; en Render se puede subir más con
# WEB_CONCURRENCY / GUNICORN_THREADS sin tocar código.
workers = int(os.getenv("WEB_CONCURRENCY", "2"))
threads = int(os.getenv("GUNICORN_THREADS", "8"))
worker_class = os.getenv("GUNICORN_WORKER_CLASS", "gthread")
timeout = int(os.getenv("GUNICORN_TIMEOUT", "300"))
graceful_timeout = int(os.getenv("GUNICORN_GRACEFUL_TIMEOUT", "60"))
keepalive = int(os.getenv("GUNICORN_KEEPALIVE", "5"))
