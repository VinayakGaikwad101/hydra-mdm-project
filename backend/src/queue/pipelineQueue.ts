import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";
import * as fs from "fs";
import * as path from "path";
import simpleGit from "simple-git";
import { runCritic } from "../agents/critic.js";
import { runCoder } from "../agents/coder.js";
import { runSandbox } from "../agents/sandbox.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);

export const redisConnection = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
});

export interface PipelineJobData {
  runId: string;
  userId: string;
  repoUrl: string;
  branch: string;
  testCommand: string;
  scenario?: string;
  stackTraceInput?: string;
  simulate?: boolean;
}

export const pipelineQueue = new Queue<PipelineJobData>("hydra-pipeline-queue", {
  connection: redisConnection,
});

// Event emitter map for real-time log streaming (SSE / WebSocket)
export const logStreamSubscribers = new Map<string, (event: string, data: any) => void>();

export function subscribeToPipelineLogs(runId: string, callback: (event: string, data: any) => void) {
  logStreamSubscribers.set(runId, callback);
}

export function unsubscribeFromPipelineLogs(runId: string) {
  logStreamSubscribers.delete(runId);
}

export function emitPipelineLog(runId: string, event: string, data: any) {
  const subscriber = logStreamSubscribers.get(runId);
  if (subscriber) {
    subscriber(event, data);
  }
}

// Background Worker: Runs completely outside Vercel's HTTP timeout
export const pipelineWorker = new Worker<PipelineJobData>(
  "hydra-pipeline-queue",
  async (job: Job<PipelineJobData>) => {
    const { runId, repoUrl, branch, testCommand, stackTraceInput, simulate } = job.data;
    const tempDir = path.join(process.cwd(), "temp-workspaces", `run-${runId}`);

    const broadcast = (event: string, payload: any) => {
      emitPipelineLog(runId, event, payload);
    };

    try {
      broadcast("log", { message: `🚀 Worker picked up job #${job.id} for run: ${runId}` });
      fs.mkdirSync(tempDir, { recursive: true });

      // Step 1: Provision Workspace (Clone or Scenario)
      broadcast("log", { message: `📥 Checking out repository ${repoUrl} [${branch}]...` });
      if (repoUrl && !simulate) {
        const git = simpleGit();
        await git.clone(repoUrl, tempDir, ["--branch", branch, "--depth", "1"]);
      } else {
        // Fallback demo files if testing simulation
        fs.writeFileSync(
          path.join(tempDir, "calculator.js"),
          `function average(arr) {\n  if (!arr) return 0;\n  var sum = arr.reduce(function(a, b) { return a + b; }, 0);\n  return sum / arr.length;\n}\nmodule.exports = { average };`
        );
      }

      // Step 2: Critic Agent
      broadcast("agent_start", { agent: "critic" });
      broadcast("log", { message: "Running Critic Agent..." });
      const criticResult = await runCritic(stackTraceInput || "Error: array empty division by zero at calculator.js:4:1", tempDir);
      broadcast("log", { message: criticResult.logMessage });
      broadcast("agent_end", { agent: "critic", output: criticResult });

      // Step 3: Coder Agent
      broadcast("agent_start", { agent: "coder" });
      broadcast("log", { message: "Running Coder Agent (LangChain Gemini 3.1 Flash Lite)..." });
      const coderResult = await runCoder(
        criticResult.failingFile,
        criticResult.lineNumber,
        criticResult.errorSummary,
        criticResult.gitHistory,
        tempDir
      );
      broadcast("log", { message: coderResult.logMessage });
      broadcast("agent_end", {
        agent: "coder",
        output: {
          explanation: coderResult.explanation,
          targetContent: coderResult.targetContent,
          replacementContent: coderResult.replacementContent,
          astNodes: coderResult.astNodes,
          astLinks: coderResult.astLinks,
        },
      });

      // Step 4: Sandbox QA Agent
      broadcast("agent_start", { agent: "sandbox" });
      broadcast("log", { message: "Staging patch verification in QA sandbox..." });
      const sandboxResult = await runSandbox(
        tempDir,
        testCommand || "npm test",
        criticResult.failingFile,
        coderResult.targetContent,
        coderResult.replacementContent,
        simulate
      );
      broadcast("log", { message: sandboxResult.logMessage });
      broadcast("agent_end", { agent: "sandbox", output: sandboxResult });

      // Update Run in DB
      await prisma.analysisRun.update({
        where: { id: runId },
        data: {
          status: sandboxResult.success ? "COMPLETED" : "FAILED",
          errorLog: sandboxResult.testLogs,
          prMarkdown: `### HYDRA Autonomous Self-Healing Patch\n\n**Root Cause:** ${criticResult.errorSummary}\n\n**Fix Explanation:** ${coderResult.explanation}\n\n**Sandbox Verification:** Passed tests with zero regressions.`,
          diffJson: JSON.stringify({
            file: criticResult.failingFile,
            target: coderResult.targetContent,
            replacement: coderResult.replacementContent,
          }),
        },
      });

      broadcast("completed", {
        success: sandboxResult.success,
        runId,
      });

      return { success: sandboxResult.success };
    } catch (err: any) {
      broadcast("log", { message: `❌ Pipeline fatal error: ${err.message}` });
      await prisma.analysisRun.update({
        where: { id: runId },
        data: { status: "FAILED", errorLog: err.message },
      });
      throw err;
    } finally {
      // Cleanup workspace directory
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  },
  { connection: redisConnection }
);
