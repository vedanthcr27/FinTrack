# FinTrack Pro — Expense Analytics

> A cloud-based personal finance analytics application built with Node.js, MongoDB Atlas, Docker, and deployed on AWS EC2.

---

## Tech Stack

| Layer      | Technology              |
|------------|-------------------------|
| Frontend   | HTML5, CSS3, JavaScript, Chart.js |
| Backend    | Node.js, Express.js     |
| Database   | MongoDB Atlas (Cloud)   |
| Container  | Docker (Single Combined Container) |
| Cloud      | AWS EC2                 |

---

## Features

- Add / edit / delete expenses with tags and priority (Need / Want / Luxury)
- Dashboard with monthly trend chart, category donut chart, 28-day heatmap
- Smart search: filter by category, payment method, priority, sort by date/amount
- Analytics: day-of-week chart, priority breakdown, payment method chart, smart insights
- Bill splitter: split bills equally or custom, track who owes whom
- Gamification: XP system, level progression, 8 unlockable badges, daily streak tracker
- Export to CSV
- Budget alerts (80% warning, exceeded alert)
- Next-month spending prediction (3-month rolling average)
- **User Authentication**: Login, signup with email/password
- **Multi-user Support**: Each user's data is isolated
- **Email Notifications**: Instant budget exceeded alerts with detailed breakdown

---

## Project Structure

```
fintrack/
├── frontend/
│   ├── index.html          # Complete single-page app
│   ├── Dockerfile          # Nginx container
│   └── nginx.conf          # Reverse proxy config
├── backend/
│   ├── server.js           # Express API server
│   ├── package.json
│   ├── Dockerfile          # Node.js container
│   └── .env.example        # Environment variable template
├── docker-compose.yml      # Orchestrates all services
└── README.md
```

---

## Local Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd fintrack/backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and add:
# - MongoDB Atlas URI (MONGO_URI)
# - JWT secret (JWT_SECRET)
# - Email credentials (EMAIL_USER, EMAIL_PASS)
```

### 3. Run with Docker (Recommended)

```bash
# From project root
docker-compose up --build

# App runs on: http://localhost:5000
# (Frontend is served from the same container)
```

### 4. Run without Docker (Development)

```bash
cd backend
npm run dev      # starts with nodemon
# Open frontend/index.html in browser (or serve with simple HTTP server)
```

---

## API Endpoints

### Expenses

| Method | Endpoint                | Description              |
|--------|-------------------------|--------------------------|
| GET    | /api/expenses           | Get all (with filters)   |
| GET    | /api/expenses/:id       | Get single expense       |
| POST   | /api/expenses           | Add new expense          |
| PUT    | /api/expenses/:id       | Update expense           |
| DELETE | /api/expenses/:id       | Delete expense           |

**Query params for GET /api/expenses:**
- `cat` — filter by category (Food, Travel, etc.)
- `pay` — filter by payment method
- `pri` — filter by priority (need, want, luxury)
- `month` — filter by month (YYYY-MM)
- `search` — search description/tags
- `sort` — date-desc, date-asc, amt-desc, amt-asc

### Analytics

| Method | Endpoint                    | Description                     |
|--------|-----------------------------|---------------------------------|
| GET    | /api/analytics/monthly      | Monthly totals                  |
| GET    | /api/analytics/categories   | Category-wise breakdown         |
| GET    | /api/analytics/priority     | Need / want / luxury breakdown  |
| GET    | /api/analytics/payments     | Payment method totals           |
| GET    | /api/analytics/predict      | Next month prediction           |

### Budget

| Method | Endpoint           | Description         |
|--------|--------------------|---------------------|
| GET    | /api/budget/:month | Get budget for month|
| POST   | /api/budget        | Set budget          |

### Bills

| Method | Endpoint       | Description     |
|--------|----------------|-----------------|
| GET    | /api/bills     | Get saved bills |
| POST   | /api/bills     | Save a bill     |
| DELETE | /api/bills/:id | Delete a bill   |

---

## AWS EC2 Deployment

### Step 1 — Launch EC2 Instance

1. Go to **AWS Console → EC2 → Launch Instance**
2. Choose: **Ubuntu 22.04 LTS**
3. Instance type: **t2.micro** (free tier)
4. Security group — open these ports:
   - Port 22 (SSH)
   - Port 80 (HTTP)
   - Port 3000 (Frontend)
   - Port 5000 (Backend API)
5. Create and download a key pair (.pem file)

### Step 2 — Connect to EC2

```bash
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@<EC2-PUBLIC-IP>
```

### Step 3 — Install Docker on EC2

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ubuntu
newgrp docker
```

### Step 4 — Upload your project

```bash
# From your local machine:
scp -i your-key.pem -r ./fintrack ubuntu@<EC2-PUBLIC-IP>:~/fintrack
```

### Step 6 — Configure and run

```bash
# On EC2:
cd ~/fintrack/backend
cp .env.example .env
nano .env    # Add:
#   - MONGO_URI (MongoDB Atlas connection string)
#   - JWT_SECRET (any random string)
#   - EMAIL_USER (Gmail address)
#   - EMAIL_PASS (Gmail App Password)

cd ~/fintrack
docker-compose up --build -d
```

### Step 7 — Access your app

```
App (Frontend + Backend):   http://<EC2-PUBLIC-IP>:5000
Health Check:                http://<EC2-PUBLIC-IP>:5000/api/health
```

---

## MongoDB Atlas Setup

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create a free cluster (M0 Sandbox)
3. Create a database user (username + password)
4. Whitelist your EC2 IP (or use 0.0.0.0/0 for all)
5. Click **Connect → Connect your application** → copy the URI
6. Paste the URI into your `.env` file

---

## Docker Commands Reference

```bash
# Build and start all containers
docker-compose up --build

# Run in background
docker-compose up -d

# View running containers
docker ps

# View logs
docker-compose logs -f
docker-compose logs -f backend

# Stop all containers
docker-compose down

# Rebuild a single service
docker-compose up --build backend

# Remove all containers and volumes
docker-compose down -v
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────┐
│                AWS EC2 Instance              │
│                                             │
│  ┌──────────────┐      ┌─────────────────┐  │
│  │  Frontend    │      │    Backend      │  │
│  │  (Nginx)     │─────▶│  (Node.js +    │  │
│  │  Port: 3000  │      │   Express)     │  │
│  └──────────────┘      │  Port: 5000    │  │
│                         └────────┬────────┘  │
│         Docker Compose           │            │
└─────────────────────────────────┼────────────┘
                                  │
                                  ▼
                     ┌─────────────────────┐
                     │   MongoDB Atlas     │
                     │   (Cloud Database)  │
                     │   AWS / GCP hosted  │
                     └─────────────────────┘
```
