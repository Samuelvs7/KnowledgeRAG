# Stage 1: Build Frontend (Vite)
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Setting empty placeholder API URL since we will serve it from the same origin locally
ENV VITE_API_URL=""
RUN npm run build

# Stage 2: Build Backend (FastAPI) and serve statically
FROM python:3.11-slim
WORKDIR /app

# Install backend dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend /app

# Copy built frontend assets into a static directory inside the backend
COPY --from=frontend-builder /app/dist /app/static

ENV PORT=8000
EXPOSE 8000

# Run FastAPI with Gunicorn (4 workers) binding to the $PORT env var
# Shell form is required so $PORT is expanded at runtime (Railway injects PORT dynamically)
CMD gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:$PORT

