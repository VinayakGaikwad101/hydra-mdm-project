import "dotenv/config";
import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { pipelineQueue, subscribeToPipelineLogs, unsubscribeFromPipelineLogs } from "./queue/pipelineQueue.js";

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5001;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

app.use(
  cors({
    origin: [CLIENT_URL, "http://localhost:3000", "https://*.vercel.app"],
    credentials: true,
  })
);
app.use(express.json({ limit: "20mb" }));

// Health Check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "HYDRA Backend Execution Engine",
    model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
    timestamp: new Date().toISOString(),
  });
});

// Trigger Pipeline (Enqueues job to BullMQ, returns runId immediately)
app.post("/api/pipeline/dispatch", async (req, res) => {
  try {
    const { repoUrl, branch = "main", testCommand = "npm test", stackTraceInput, simulate = false, userId } = req.body;

    // Persist Run record
    const run = await prisma.analysisRun.create({
      data: {
        repositoryId: req.body.repositoryId || "standalone-run",
        status: "QUEUED",
      },
    });

    // Enqueue job to Redis BullMQ
    await pipelineQueue.add("run-pipeline", {
      runId: run.id,
      userId: userId || "default-user",
      repoUrl,
      branch,
      testCommand,
      stackTraceInput,
      simulate,
    });

    res.json({
      success: true,
      runId: run.id,
      message: "Pipeline successfully enqueued for background execution.",
    });
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
  console.log("======================================================\n");
});
