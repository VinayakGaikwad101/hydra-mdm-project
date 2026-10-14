import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "../..");
const rootDir = path.resolve(backendDir, "..");

console.log("\n======================================================");
console.log("   HYDRA Self-Healing CI/CD Platform Initialization   ");
console.log("======================================================\n");

// 1. Auto-create backend/.env from .env.example if missing
const envPath = path.join(backendDir, ".env");
const exampleEnvPath = path.join(backendDir, ".env.example");
if (!fs.existsSync(envPath) && fs.existsSync(exampleEnvPath)) {
  console.log("[Environment] No backend/.env found. Creating from .env.example...");
  fs.copyFileSync(exampleEnvPath, envPath);
  console.log("[Environment] Created backend/.env successfully.\n");
}

// 2. Check and start Docker containers (Redis & MongoDB) automatically
let dockerActive = false;
try {
  execSync("docker info", { stdio: "ignore" });
  dockerActive = true;
  console.log("[Docker] Docker engine confirmed online.");
} catch {
  console.log("[Docker] Docker daemon is not running. Please ensure Docker Desktop is started.");
}

if (dockerActive) {
  try {
    console.log("[Docker] Starting Redis (6379) and MongoDB (27017) containers (docker compose up -d)...");
    execSync("docker compose up -d redis mongo", { cwd: rootDir, stdio: "inherit" });
    console.log("[Docker] Containers confirmed healthy: Redis (6379) and MongoDB (27017).\n");
  } catch (err) {
    console.warn("[Docker] Warning: Could not run docker compose up.\n");
  }
}
