import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { UserModel, AnalysisRunModel } from "./models/mongooseModels.js";
import { pipelineQueue, subscribeToPipelineLogs, unsubscribeFromPipelineLogs } from "./queue/pipelineQueue.js";

const app = express();
const PORT = process.env.PORT || 5001;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET || "hydra-super-secret-jwt-key-2026";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/hydra_ci_cd";

// Connect to MongoDB
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("[Database] Connected to local MongoDB successfully."))
  .catch((err) => console.error("[Database] MongoDB connection error:", err.message));

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl) or any vercel.app / localhost
      if (!origin || origin.includes("vercel.app") || origin.includes("localhost") || origin.includes("127.0.0.1") || origin === CLIENT_URL) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive for production webhooks and preview branches
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);
app.use(express.json({ limit: "20mb" }));

// Health Check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "HYDRA Backend Execution Engine",
    model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

// -------------------------------------------------------------
// Basic Email/Password Auth (Name, Email, Password - No OTP)
// -------------------------------------------------------------

// Register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: "Name, email, and password are required." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await UserModel.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ success: false, error: "An account with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await UserModel.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
    });

    const token = jwt.sign({ userId: user._id, email: user.email, name: user.name }, JWT_SECRET, {
      expiresIn: "30d",
    });

    return res.json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email },
      message: "Registration successful.",
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await UserModel.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ success: false, error: "Invalid email or password." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: "Invalid email or password." });
    }

    const token = jwt.sign({ userId: user._id, email: user.email, name: user.name }, JWT_SECRET, {
      expiresIn: "30d",
    });

    return res.json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email },
      message: "Login successful.",
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Me (Verify session token)
app.get("/api/auth/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const user = await UserModel.findById(decoded.userId).select("-password");
    if (!user) {
      return res.status(401).json({ success: false, error: "User not found" });
    }

    return res.json({ success: true, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err: any) {
    return res.status(401).json({ success: false, error: "Invalid or expired token" });
  }
});

// -------------------------------------------------------------
// Pipeline Endpoints
// -------------------------------------------------------------

// Trigger Pipeline
app.post("/api/pipeline/dispatch", async (req, res) => {
  try {
    const { repoUrl, branch = "main", testCommand = "npm test", stackTraceInput, simulate = false, userId } = req.body;

    // Create analysis run document
    let runId = new mongoose.Types.ObjectId().toString();
    try {
      const runDoc = await AnalysisRunModel.create({
        repositoryUrl: repoUrl || "",
        branch,
        testCommand,
        status: "QUEUED",
        userId: userId || "anonymous",
      });
      runId = runDoc._id.toString();
    } catch (e: any) {
      console.warn("Could not save initial run doc to Mongo:", e.message);
    }

    // Enqueue job to Redis BullMQ
    await pipelineQueue.add("run-pipeline", {
      runId,
      userId: userId || "anonymous",
      repoUrl,
      branch,
      testCommand,
      stackTraceInput,
      simulate,
    });

    res.json({
      success: true,
      runId,
      message: "Pipeline successfully enqueued for background execution.",
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Live BullMQ Queue Telemetry (Waiting, Active, Completed, Failed, Delayed)
app.get("/api/queue/metrics", async (_req, res) => {
  try {
    const counts = await pipelineQueue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed",
      "paused"
    );

    const activeJobs = await pipelineQueue.getActive(0, 10);
    const waitingJobs = await pipelineQueue.getWaiting(0, 10);
    const failedJobs = await pipelineQueue.getFailed(0, 10);
    const completedJobs = await pipelineQueue.getCompleted(0, 10);

    const mapJob = (j: any) => ({
      id: j.id,
      name: j.name,
      timestamp: j.timestamp,
      processedOn: j.processedOn,
      finishedOn: j.finishedOn,
      data: {
        runId: j.data?.runId,
        repoUrl: j.data?.repoUrl,
        branch: j.data?.branch,
        testCommand: j.data?.testCommand,
      },
      failedReason: j.failedReason,
    });

    res.json({
      success: true,
      counts,
      active: activeJobs.map(mapJob),
      waiting: waitingJobs.map(mapJob),
      failed: failedJobs.map(mapJob),
      completed: completedJobs.map(mapJob),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Pipeline Runs History
app.get("/api/runs", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const runs = await AnalysisRunModel.find().sort({ createdAt: -1 }).limit(limit);
    res.json({ success: true, runs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Server-Sent Events (SSE) log stream for real-time live terminal output
app.get("/api/pipeline/stream/:runId", (req, res) => {
  const { runId } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent("connected", { runId, message: "Connected to HYDRA live event stream." });

  subscribeToPipelineLogs(runId, (event, data) => {
    sendEvent(event, data);
  });

  req.on("close", () => {
    unsubscribeFromPipelineLogs(runId);
  });
});

app.listen(PORT, () => {
  console.log("\n======================================================");
  console.log(`[HYDRA Engine] Express Server running on http://localhost:${PORT}`);
  console.log(`[AI Model] ${process.env.GEMINI_MODEL || "gemini-3.1-flash-lite"} (Multi-Key Rotation Active)`);
  console.log(`[Queue] BullMQ Redis worker listening for pipeline jobs`);
  console.log(`[Database] Local MongoDB: ${MONGODB_URI}`);
  console.log("======================================================\n");
});
