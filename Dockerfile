# ─── Root Dockerfile for Render Deployment ──────────────────────────────────
# Node.js 20 Alpine with Frontend + Backend in one container

FROM node:20-alpine

WORKDIR /app

# Copy backend package files
COPY ./backend/package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy backend source code
COPY ./backend .

# Copy frontend files for Express to serve
COPY ./frontend /app/frontend

# Expose port
EXPOSE 5000

# Start server
CMD ["node", "server.js"]
