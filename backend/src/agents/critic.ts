import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { GeminiService } from "../services/geminiService.js";

export interface CriticOutput {
  failingFile: string;
  lineNumber: number;
  errorSummary: string;
  gitHistory: string;
  logMessage: string;
}

export async function runCritic(
  stackTrace: string,
  workspacePath: string
): Promise<CriticOutput> {
  let logMessage = "Critic Agent initialized: parsing execution stack trace...\n";

  let detectedFile = "";
  let detectedLine = 0;

  // 1. Fast regex extraction of stack traces
  const regex = /(?:at\s+.*\((.*?):(\d+):(\d+)\)|at\s+(.*?):(\d+):(\d+))/g;
  let match;
  const filesFound: { path: string; line: number }[] = [];

  while ((match = regex.exec(stackTrace)) !== null) {
    const candidatePath = match[1] || match[4];
    const lineNum = parseInt(match[2] || match[5], 10);

    if (
      candidatePath &&
      !candidatePath.includes("node_modules") &&
      !candidatePath.includes("node:") &&
      fs.existsSync(candidatePath)
    ) {
      filesFound.push({ path: candidatePath, line: lineNum });
    }
  }

  if (filesFound.length > 0) {
    const nonTestFile = filesFound.find(
      (f) => !path.basename(f.path).includes("test") && !path.basename(f.path).includes("spec")
    );
    const chosen = nonTestFile || filesFound[0];
    detectedFile = chosen.path;
    detectedLine = chosen.line;
    logMessage += `✓ Stack trace match: ${path.basename(detectedFile)} at line ${detectedLine}\n`;
  }

  // 2. LangChain Gemini Critic for intelligent fault localization
  let errorSummary = "Pipeline test assertion or runtime crash.";
  let gitHistory = "No git history available.";

  const gemini = GeminiService.getInstance();
  const keyRotator = gemini.getKeyRotator();
  const activeKey = keyRotator.getActiveKey();

  if (activeKey) {
    try {
      logMessage += `Consulting LangChain Critic (${gemini.getModelName()} via ${keyRotator.getMaskedKey()})...\n`;
      const model = gemini.getModel(activeKey, 0.1);

      const prompt = `
You are the Critic / Root-Cause Diagnosis Agent in an autonomous self-healing CI/CD pipeline.
Analyze this stack trace or build failure log and identify:
1. The exact relative path of the source file where the defect originates (ignore testing libraries / runners).
2. The failing line number.
3. A concise 1-sentence technical root cause summary.

ERROR LOG:
"""
${stackTrace}
"""

FILES AVAILABLE IN WORKSPACE:
${listWorkspaceFiles(workspacePath).join("\n")}

Respond strictly in valid JSON without backticks:
{
  "failingFile": "path/to/source.ts",
  "lineNumber": 15,
  "errorSummary": "Division by zero when array is empty"
}`;

      const response = await model.invoke([
        new SystemMessage("You are an expert compiler and runtime error diagnostic engine."),
        new HumanMessage(prompt),
      ]);

      const raw = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
      const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*$/gi, "").trim();
      const parsed = JSON.parse(clean);

      errorSummary = parsed.errorSummary || errorSummary;

      const resolved = path.isAbsolute(parsed.failingFile)
        ? parsed.failingFile
        : path.join(workspacePath, parsed.failingFile);

      if (fs.existsSync(resolved)) {
        detectedFile = resolved;
        detectedLine = parsed.lineNumber || detectedLine;
        logMessage += `✓ Critic isolated defect target: ${parsed.failingFile}:${detectedLine}\n`;
      }
    } catch (err: any) {
      logMessage += `⚠ Critic LLM analysis warning: ${err.message}. Proceeding with pattern match.\n`;
    }
  }

  if (!detectedFile) {
    const files = listWorkspaceFiles(workspacePath);
    const sourceFiles = files.filter(
      (f) => f.endsWith(".js") || f.endsWith(".ts") || f.endsWith(".py") || f.endsWith(".java")
    );
    const firstCandidate = sourceFiles.find((f) => !f.includes("test") && !f.includes("spec"));
    if (firstCandidate) {
      detectedFile = path.join(workspacePath, firstCandidate);
      detectedLine = 1;
      logMessage += `⚠ Defaulting to primary source file: ${firstCandidate}\n`;
    } else {
      throw new Error("Critic Agent failed: No valid source code files found in target workspace.");
    }
  }

  // 3. Inspect recent Git commits
  try {
    const gitLog = execSync(`git log -n 5 --oneline -- "${detectedFile}"`, {
      cwd: workspacePath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    gitHistory = gitLog || "No recent commits.";
    logMessage += `✓ Retrieved ${gitHistory.split("\n").filter(Boolean).length} recent commit(s) for context.\n`;
  } catch {
    gitHistory = "No git history found.";
  }

  return {
    failingFile: detectedFile,
    lineNumber: detectedLine,
    errorSummary,
    gitHistory,
    logMessage,
  };
}

function listWorkspaceFiles(dir: string, baseDir = dir): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (["node_modules", ".git", ".next", "dist", ".cache"].includes(file)) continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(listWorkspaceFiles(fullPath, baseDir));
    } else {
      results.push(path.relative(baseDir, fullPath).replace(/\\/g, "/"));
    }
  }
  return results;
}
