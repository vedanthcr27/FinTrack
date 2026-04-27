# ─── Combined Dockerfile ───────────────────────────────────────────────────────
# Node.js 20 LTS (Alpine = lightweight image) + Static Frontend Files
# Serves both Backend API and Frontend in one container

FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy backend package files first (leverages Docker layer caching)
COPY ./backend/package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy backend source code
COPY ./backend . 

# Copy frontend files for Express to serve as static files
COPY ./frontend /app/frontend

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:5000 || exit 1

# Start server
CMD ["node", "server.js"]
