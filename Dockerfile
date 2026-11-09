FROM node:22-bookworm-slim AS frontend
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 EGIDIUS_SECURE_COOKIES=true EGIDIUS_STATIC_DIR=/app/dist
WORKDIR /app
COPY backend/requirements.lock.txt /app/backend/requirements.lock.txt
RUN pip install --no-cache-dir --require-hashes -r /app/backend/requirements.lock.txt
COPY backend/egidius_api /app/backend/egidius_api
COPY tools /app/tools
COPY --from=frontend /app/dist /app/dist
RUN mkdir -p /app/backend/var /app/backend/backups
ENV PYTHONPATH=/app/backend
EXPOSE 8080
CMD ["sh","-c","exec uvicorn egidius_api.production:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]
