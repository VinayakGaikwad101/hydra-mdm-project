import * as fs from "fs";
import * as path from "path";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { GeminiService } from "../services/geminiService.js";
import { getASTAnalysis } from "../parser/ast.js";

export interface CoderOutput {
  explanation: string;
  targetContent: string;
  replacementContent: string;
  astNodes: any[];
  astLinks: any[];
  logMessage: string;
}

export async function runCoder(
  failingFile: string,
  lineNumber: number,
  errorSummary: string,
  gitHistory: string,
  workspacePath: string
): Promise<CoderOutput> {
  let logMessage = "Coder Agent initialized: synthesizing AST-guided patch...\n";
  const relativeFile = path.relative(workspacePath, failingFile).replace(/\\/g, "/");

  // 1. Read source code
  const fileContent = fs.readFileSync(failingFile, "utf-8");

  // 2. Structural AST Analysis via Babel (TS/JS/JSX) or Python AST
  logMessage += `Extracting AST hierarchy for ${relativeFile}...\n`;
  const astReport = getASTAnalysis(failingFile);

  if (astReport.error) {
    logMessage += `⚠ AST Notice: ${astReport.error}\n`;
  } else {
    logMessage += `✓ AST parsed: ${astReport.nodes.length} structural symbol(s) and ${astReport.links.length} call edge(s).\n`;
  }

  // 3. LangChain Gemini invocation with auto-rotation on 429
  const gemini = GeminiService.getInstance();
  const keyRotator = gemini.getKeyRotator();
  const maxRetries = Math.max(3, keyRotator.totalKeys() * 2);
  let attempt = 0;

  const astSummary = JSON.stringify(
    {
      nodes: astReport.nodes.map((n) => ({ name: n.name, type: n.type, line: n.line })),
      calls: astReport.links.slice(0, 20),
    },
    null,
    2
  );

  const prompt = `
You are the Coder / Patch Synthesis Agent in an autonomous self-healing CI/CD pipeline.
Your goal is to write a surgical, minimal patch to fix a failing test suite.

--- CRASH CONTEXT ---
Target File: ${relativeFile}
Line of Failure: ${lineNumber}
Root Cause: ${errorSummary}

--- AST ARCHITECTURE HIERARCHY ---
${astSummary}

--- RECENT COMMIT HISTORY ---
${gitHistory}

--- SOURCE CODE ---
\`\`\`
${fileContent}
\`\`\`

--- CRITICAL INSTRUCTIONS ---
1. Identify the exact lines of code that need fixing.
2. Provide 'targetContent' which must match the original file text EXACTLY (including original whitespace/indentation).
3. Provide 'replacementContent' with the clean bugfix applied.
4. Do not rewrite unrelated functions. Keep changes localized.
5. Provide a semantic call-graph hierarchy ('astNodes' and 'astLinks') that models the key functions, callers, and classes involved in this code path so developers can visualize the execution flow.

Respond strictly in valid JSON without backticks:
{
  "explanation": "Clear explanation of how this patch fixes the defect",
  "targetContent": "exact original code chunk to replace",
  "replacementContent": "new replacement code chunk",
  "astNodes": [
    { "name": "functionOrClass()", "type": "function", "line": 1 }
  ],
  "astLinks": [
    { "caller": "callerFunction", "callee": "calleeFunction", "line": 1 }
  ]
}`;

  while (attempt < maxRetries) {
    attempt++;
    const activeKey = keyRotator.getActiveKey();
    if (!activeKey) {
      throw new Error("Coder Agent: No valid Gemini API keys found in environment.");
    }

    try {
      logMessage += `Prompting LangChain Coder (${gemini.getModelName()} via ${keyRotator.getMaskedKey()} - Attempt #${attempt})...\n`;
      const model = gemini.getModel(activeKey, 0.2);

      const response = await model.invoke([
        new SystemMessage("You are an elite autonomous software engineering patch agent."),
        new HumanMessage(prompt),
      ]);

      const raw = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
      const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*$/gi, "").trim();
      const parsed = JSON.parse(clean);

      // Verify targetContent exists in file
      if (!fileContent.includes(parsed.targetContent)) {
        const cleanTarget = parsed.targetContent.trim();
        if (fileContent.includes(cleanTarget)) {
          logMessage += "✓ Match verified using normalized boundary trim.\n";
          parsed.targetContent = cleanTarget;
        } else {
          logMessage += "⚠ Strict match mismatch. Applying line-level fuzzy locator...\n";
        }
      } else {
        logMessage += `✓ Synthesized verified patch chunk (${parsed.replacementContent.split("\n").length} line(s)).\n`;
      }

      // Merge AST: Use parser's exact AST if plentiful, or enrich with Gemini's reasoning graph
      let finalNodes = astReport.nodes;
      let finalLinks = astReport.links;

      if (finalNodes.length < 2 && Array.isArray(parsed.astNodes) && parsed.astNodes.length > 0) {
        logMessage += `✓ Enriched AST Call Graph with ${parsed.astNodes.length} semantic execution node(s).\n`;
        const existingNames = new Set(finalNodes.map((n) => n.name));
        const mergedNodes = [...finalNodes];
        parsed.astNodes.forEach((n: any) => {
          if (n && n.name && !existingNames.has(n.name)) {
            mergedNodes.push({
              name: String(n.name),
              type: n.type === "class" ? "class" : n.type === "variable" ? "variable" : "function",
              line: Number(n.line) || lineNumber || 1,
            });
            existingNames.add(n.name);
          }
        });
        finalNodes = mergedNodes;
        if (Array.isArray(parsed.astLinks) && parsed.astLinks.length > 0) {
          finalLinks = [...finalLinks, ...parsed.astLinks];
        }
      }

      return {
        explanation: parsed.explanation || "Automated bugfix generated.",
        targetContent: parsed.targetContent,
        replacementContent: parsed.replacementContent,
        astNodes: finalNodes,
        astLinks: finalLinks,
        logMessage,
      };
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isRecoverable =
        errMsg.includes("429") ||
        errMsg.includes("quota") ||
        errMsg.includes("ResourceExhausted") ||
        errMsg.includes("503") ||
        errMsg.includes("500") ||
        errMsg.includes("502") ||
        errMsg.includes("high demand") ||
        errMsg.includes("Service Unavailable") ||
        errMsg.includes("overloaded");

      if (isRecoverable) {
        logMessage += `⚠ Provider transient status (${errMsg.slice(0, 70)}...). Rotating to next API key...\n`;
        keyRotator.rotateToNextKey("Transient error / 503 / Quota");
        await new Promise((r) => setTimeout(r, 1200 * attempt));
        continue;
      }
      logMessage += `❌ Coder synthesis error: ${errMsg}\n`;
      throw err;
    }
  }

  throw new Error("Coder Agent: Exceeded maximum retry attempts across Gemini key rotation pool.");
}
