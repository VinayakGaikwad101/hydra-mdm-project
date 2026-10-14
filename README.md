# HYDRA: Autonomous Self-Healing CI/CD Platform

> **Live Production URL**: [https://frontend-omega-puce-49.vercel.app](https://frontend-omega-puce-49.vercel.app)  
> **Backend Gateway**: `https://137.23.40.113.sslip.io/hydra`

---

## Quick Setup Guide (Run Locally)

### Prerequisites
- **Node.js** (v20+ recommended)
- **Docker Desktop** (Keep Docker Desktop running in the background)

---

### Step 1: Configure Environment Variables
Inside the `backend` folder, create a file named `.env`:

```env
PORT=5001
NODE_ENV=development
CLIENT_URL=http://localhost:3000
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GEMINI_API_KEYS=YOUR_GEMINI_API_KEY_1,YOUR_GEMINI_API_KEY_2
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
MONGODB_URI=mongodb://127.0.0.1:27017/hydra_ci_cd
JWT_SECRET=hydra-super-secret-jwt-key-2026
```

---

### Step 2: Start the Backend (Terminal 1)
```bash
cd backend
npm install
npm run dev
```
- Starts at: `http://localhost:5001`
- **Automatic Docker Bootstrapping**: `npm run dev` automatically starts Redis (`6379`) and MongoDB (`27017`) via `docker compose up -d` without manual commands.

---

### Step 3: Start the Frontend (Terminal 2)
```bash
cd frontend
npm install
npm run dev
```
- Opens at: `http://localhost:3000`

---

## Project Overview

**HYDRA** is an autonomous CI/CD self-healing agent platform designed to reduce mean-time-to-resolution (MTTR) by diagnosing and verifying code defects without manual intervention:

1. **Critic Agent (Root-Cause Localization)**:
   - Scans execution stack traces across **Python**, **JavaScript/TypeScript**, and **Java (Maven)**.
   - Extracts source line coordinates and isolates defective target files.

2. **AST Call Hierarchy Visualizer**:
   - Analyzes source code structure via Babel, Python AST, and Java AST parsers.
   - Leverages Gemini semantic reasoning to render an interactive, interconnected symbol call graph with animated directional paths.

3. **Coder Agent (Surgical Patch Synthesis)**:
   - Formulates minimal, targeted code fixes using `gemini-3.1-flash-lite`.
   - Employs an automated **Multi-Key Rotator** with exponential backoff that cycles across API keys on 503 spikes or rate limits.

4. **QA Sandbox Agent (Docker Verification)**:
   - Automatically selects and pulls the correct container image (`node:20-alpine`, `python:3.11-alpine`, or `maven:3.9-eclipse-temurin-17`).
   - Applies the synthesized patch and executes the test suite in isolation.

5. **Dual Platform Modes**:
   - 🔧 **Fix Repository Issues**: Full automated self-healing pipeline with visual patch inspection.
   - 💬 **Chat With Repository**: Multi-turn conversation assistant scoped to the current codebase and branch.

6. **Worker Queues Monitor**:
   - Real-time BullMQ telemetry in the navbar showing Active, Waiting, Completed, and Failed jobs directly from Redis.

---

## Architectural Diagrams
Architecture, sequence, class, and data flow diagrams are available in the [`diagrams/`](./diagrams) directory:
- [System Architecture](./diagrams/1_system_architecture.png)
- [Autonomous Healing Sequence](./diagrams/2_sequence_self_heal.png)
- [Data Flow Diagram (Level 0)](./diagrams/3_dfd_level_0.png)
- [Class & Agent Architecture](./diagrams/4_class_diagram.png)
