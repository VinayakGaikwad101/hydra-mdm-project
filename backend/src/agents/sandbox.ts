import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import Docker from "dockerode";

export interface SandboxOutput {
  success: boolean;
  testLogs: string;
  logMessage: string;
}

export async function runSandbox(
  workspacePath: string,
  testCommand: string,
  failingFile: string,
  targetContent: string,
  replacementContent: string,
  isSimulation = false
): Promise<SandboxOutput> {
  let logMessage = "QA Sandbox Agent initialized: staging patch verification...\n";
  let testLogs = "";

  // 1. Apply patch with fuzzy whitespace fallback
  const fileContent = fs.readFileSync(failingFile, "utf-8");

  if (fileContent.includes(targetContent)) {
    const patched = fileContent.replace(targetContent, replacementContent);
    fs.writeFileSync(failingFile, patched, "utf-8");
    logMessage += "✓ Applied exact patch replacement.\n";
  } else if (fileContent.includes(targetContent.trim())) {
    const patched = fileContent.replace(targetContent.trim(), replacementContent);
    fs.writeFileSync(failingFile, patched, "utf-8");
    logMessage += "✓ Applied trimmed match patch replacement.\n";
  } else {
    // Line-by-line fallback
    const targetLines = targetContent.trim().split("\n").map((l) => l.trim()).filter(Boolean);
    const sourceLines = fileContent.split("\n");
    let matchStart = -1;

    for (let i = 0; i <= sourceLines.length - targetLines.length; i++) {
      let matched = true;
      for (let j = 0; j < targetLines.length; j++) {
        if (!sourceLines[i + j].trim().includes(targetLines[j])) {
          matched = false;
          break;
        }
      }
      if (matched) {
        matchStart = i;
        break;
      }
    }

    if (matchStart !== -1) {
      sourceLines.splice(matchStart, targetLines.length, replacementContent);
      fs.writeFileSync(failingFile, sourceLines.join("\n"), "utf-8");
      logMessage += "✓ Applied line-by-line fuzzy patch replacement.\n";
    } else {
      logMessage += "❌ Error: Target content could not be located in file.\n";
      return {
        success: false,
        testLogs: "Patch Application Failed: target code segment not found in source file.",
        logMessage,
      };
    }
  }

  // 2. Simulation check
  if (isSimulation) {
    logMessage += "Simulation mode active: executing simulated verification run...\n";
    await new Promise((r) => setTimeout(r, 1200));
    testLogs = `
Test Suite Execution
====================
Running automated tests...
✓ Test add passed
✓ Test division by zero passed
✓ Test empty array average passed

ALL TESTS PASSED!
`;
    logMessage += "✓ Sandbox verified: All tests passed with zero regressions.\n";
    return { success: true, testLogs, logMessage };
  }

  // 3. Multi-language Docker Container Sandbox Detection
  logMessage += "Inspecting repository manifest and test command to select container image...\n";
  let dockerImage = "node:20-alpine";
  let installCmd = "";

  const isPython =
    testCommand.includes("python") ||
    testCommand.includes("pytest") ||
    failingFile.endsWith(".py") ||
    fs.existsSync(path.join(workspacePath, "requirements.txt")) ||
    fs.existsSync(path.join(workspacePath, "pyproject.toml"));

  const isJava =
    testCommand.includes("mvn") ||
    testCommand.includes("gradle") ||
    failingFile.endsWith(".java") ||
    fs.existsSync(path.join(workspacePath, "pom.xml"));

  if (isPython) {
    dockerImage = "python:3.11-alpine";
    let pipDeps = "";
    if (fs.existsSync(path.join(workspacePath, "requirements.txt"))) {
      pipDeps += "pip install -r requirements.txt --quiet && ";
    } else if (fs.existsSync(path.join(workspacePath, "pyproject.toml"))) {
      pipDeps += "pip install -e . --quiet 2>/dev/null || true && ";
    }
    if (testCommand.includes("pytest")) {
      pipDeps += "which pytest >/dev/null 2>&1 || pip install pytest --quiet && ";
    }
    installCmd = pipDeps;
  } else if (isJava) {
    dockerImage = "maven:3.9-eclipse-temurin-17";
  } else {
    dockerImage = "node:20-alpine";
    if (fs.existsSync(path.join(workspacePath, "package.json"))) {
      installCmd = "npm install --no-audit --no-fund --quiet && ";
    }
  }

  logMessage += `Selected Sandbox Environment: ${dockerImage}\n`;

  // Try Docker Execution
  let dockerConnected = false;
  let docker: Docker | null = null;
  try {
    docker = new Docker();
    await docker.ping();
    dockerConnected = true;
    logMessage += "✓ Docker engine confirmed online.\n";
  } catch (err: any) {
    logMessage += `⚠ Docker daemon not available (${err.message}). Using local isolated subprocess...\n`;
  }

  if (dockerConnected && docker) {
    try {
      logMessage += `Pulling/verifying container image: ${dockerImage}...\n`;
      await new Promise<void>((resolve, reject) => {
        docker!.pull(dockerImage, {}, (err: any, stream: any) => {
          if (err) return reject(err);
          docker!.modem.followProgress(stream, (followErr: any) => {
            if (followErr) return reject(followErr);
            resolve();
          });
        });
      });

      const hostBindPath = workspacePath.replace(/\\/g, "/");
      const fullCmd = `${installCmd}${testCommand}`;
      logMessage += `Starting container execution: sh -c "${fullCmd}"...\n`;

      const container = await docker.createContainer({
        Image: dockerImage,
        Cmd: ["sh", "-c", fullCmd],
        WorkingDir: "/app",
        HostConfig: {
          Binds: [`${hostBindPath}:/app`],
        },
        AttachStdout: true,
        AttachStderr: true,
      });

      await container.start();
      const waitResult = await container.wait();
      const exitCode = waitResult.StatusCode;

      const logBuffer = await container.logs({ stdout: true, stderr: true });
      testLogs = cleanDockerLogs(logBuffer);

      await container.remove();
      logMessage += `Container exited with status code ${exitCode}.\n`;

      if (exitCode === 0) {
        logMessage += "✓ Test suite PASSED inside Docker sandbox!\n";
        return { success: true, testLogs, logMessage };
      } else {
        logMessage += "❌ Test suite FAILED inside Docker sandbox.\n";
        return { success: false, testLogs, logMessage };
      }
    } catch (dockerErr: any) {
      logMessage += `⚠ Docker run failed: ${dockerErr.message}. Falling back to subprocess...\n`;
    }
  }

  // Subprocess fallback
  logMessage += `Running test suite locally: "${testCommand}"...\n`;
  try {
    const output = execSync(testCommand, {
      cwd: workspacePath,
      encoding: "utf-8",
      env: { ...process.env, NODE_ENV: "test" },
    });
    testLogs = output;
    logMessage += "✓ Test suite PASSED in subprocess.\n";
    return { success: true, testLogs, logMessage };
  } catch (err: any) {
    testLogs = (err.stdout || "") + "\n" + (err.stderr || "");
    logMessage += "❌ Test suite FAILED in subprocess.\n";
    return { success: false, testLogs, logMessage };
  }
}

function cleanDockerLogs(buffer: Buffer): string {
  let result = "";
  let offset = 0;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) break;
    const size = buffer.readUInt32BE(offset + 4);
    const chunk = buffer.toString("utf8", offset + 8, offset + 8 + size);
    result += chunk;
    offset += 8 + size;
  }
  return result || buffer.toString("utf8");
}
