"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  Terminal as TerminalIcon,
  GitPullRequest,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Code2,
  Layers,
  LogOut,
  FileCode2,
} from "lucide-react";
import { ASTVisualizer } from "@/components/ASTVisualizer";
import { Spinner, Skeleton } from "@/components/ui/Feedback";
import { useAuth } from "@/context/AuthContext";
import { AuthScreen } from "@/components/AuthScreen";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5001";

interface RunResult {
  runId: string;
  status: "idle" | "running" | "completed" | "failed";
  failingFile?: string;
  lineNumber?: number;
  errorSummary?: string;
  explanation?: string;
  targetContent?: string;
  replacementContent?: string;
  astNodes: any[];
  astLinks: any[];
  testLogs?: string;
}

export default function HydraDashboard() {
  const { user, token, isLoading, logout } = useAuth();

  const [repoUrl, setRepoUrl] = useState("https://github.com/VinayakGaikwad101/hydra-mdm-project");
  const [branch, setBranch] = useState("main");
  const [testCommand, setTestCommand] = useState("node test-fixtures/node-target/test/calculator.test.js");
  const [stackTrace, setStackTrace] = useState(
    "TypeError: Cannot read properties of undefined (reading 'length')\n    at calculateAverage (test-fixtures/node-target/src/calculator.js:5:17)\n    at Object.<anonymous> (test-fixtures/node-target/test/calculator.test.js:6:3)"
  );
  const [simulate, setSimulate] = useState(false);

  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [runResult, setRunResult] = useState<RunResult>({
    runId: "",
    status: "idle",
    astNodes: [],
    astLinks: [],
  });

  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Loading state while checking localStorage session
  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#0b0f19] text-slate-400 gap-3">
        <Spinner size="lg" />
        <span className="text-xs font-mono">Verifying HYDRA session...</span>
      </div>
    );
  }

  // Full Screen Auth Gate: Non-authenticated visitors CANNOT see the dashboard
  if (!user || !token) {
    return <AuthScreen backendUrl={BACKEND_URL} />;
  }

  const handleRunPipeline = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setLogs(["[Hydra Client] Initiating pipeline dispatch to BullMQ worker..."]);
    setRunResult((prev) => ({ ...prev, status: "running" }));

    try {
      const res = await fetch(`${BACKEND_URL}/api/pipeline/dispatch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          repoUrl,
          branch,
          testCommand,
          stackTraceInput: stackTrace,
          simulate,
          userId: user.id,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Dispatch failed");
      }

      const runId = data.runId;
      setRunResult((prev) => ({ ...prev, runId }));
      setLogs((prev) => [...prev, `[Queue] Job accepted. Run ID: ${runId}`]);

      // Connect to Server-Sent Events (SSE) Stream
      const eventSource = new EventSource(`${BACKEND_URL}/api/pipeline/stream/${runId}`);

      eventSource.addEventListener("log", (e) => {
        const payload = JSON.parse(e.data);
        setLogs((prev) => [...prev, payload.message]);
      });

      eventSource.addEventListener("agent_end", (e) => {
        const payload = JSON.parse(e.data);
        if (payload.agent === "critic") {
          setRunResult((prev) => ({
            ...prev,
            failingFile: payload.output.failingFile,
            lineNumber: payload.output.lineNumber,
            errorSummary: payload.output.errorSummary,
          }));
        } else if (payload.agent === "coder") {
          setRunResult((prev) => ({
            ...prev,
            explanation: payload.output.explanation,
            targetContent: payload.output.targetContent,
            replacementContent: payload.output.replacementContent,
            astNodes: payload.output.astNodes || [],
            astLinks: payload.output.astLinks || [],
          }));
        } else if (payload.agent === "sandbox") {
          setRunResult((prev) => ({
            ...prev,
            testLogs: payload.output.testLogs,
          }));
        }
      });

      eventSource.addEventListener("completed", (e) => {
        const payload = JSON.parse(e.data);
        setIsRunning(false);
        setRunResult((prev) => ({
          ...prev,
          status: payload.success ? "completed" : "failed",
        }));
        setLogs((prev) => [
          ...prev,
          payload.success
            ? "Pipeline execution COMPLETED successfully."
            : "Pipeline execution FAILED in sandbox verification.",
        ]);
        eventSource.close();
      });

      eventSource.onerror = () => {
        setIsRunning(false);
        eventSource.close();
      };
    } catch (err: any) {
      setIsRunning(false);
      setRunResult((prev) => ({ ...prev, status: "failed" }));
      setLogs((prev) => [...prev, `[Error] ${err.message}`]);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19] text-slate-100">
      {/* Clean Navigation Bar - Zero model badges or guest sign-in buttons */}
      <header className="sticky top-0 z-40 h-16 border-b border-slate-800 bg-[#111827]/80 backdrop-blur-md px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-lg shadow-md shadow-blue-500/20">
            H
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-white text-base">HYDRA</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-blue-950/80 text-blue-400 border border-blue-800/80">
                Self-Healing CI/CD
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Authenticated User Info */}
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900/60">
            <div className="h-7 w-7 rounded-lg bg-blue-600/30 border border-blue-500/40 text-blue-300 flex items-center justify-center font-bold text-xs uppercase">
              {user.name.charAt(0)}
            </div>
            <div className="text-left text-xs">
              <div className="font-medium text-slate-200">{user.name}</div>
              <div className="text-[10px] text-slate-400 font-mono">{user.email}</div>
            </div>
            <button
              onClick={logout}
              title="Sign Out"
              className="ml-2 p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-6 max-w-[1600px] w-full mx-auto space-y-6">
        {/* Top Split: Configuration & AST Visualizer */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Pipeline Targets (4 Cols) */}
          <div className="lg:col-span-4 bg-[#111827] border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileCode2 className="h-4 w-4 text-blue-500" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                  Pipeline Target
                </h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-900 text-slate-400 border border-slate-800">
                Queue Active
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Repository URL
              </label>
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                className="w-full px-3.5 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Branch
                </label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Test Command
                </label>
                <input
                  type="text"
                  value={testCommand}
                  onChange={(e) => setTestCommand(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Failing CI/CD Stack Trace
              </label>
              <textarea
                rows={5}
                value={stackTrace}
                onChange={(e) => setStackTrace(e.target.value)}
                className="w-full p-3 text-xs font-mono bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-none transition-all"
              />
            </div>

            <div className="pt-2 border-t border-slate-800 space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                Quick Test Target Presets
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRepoUrl("https://github.com/VinayakGaikwad101/hydra-mdm-project");
                    setBranch("main");
                    setTestCommand("node test-fixtures/node-target/test/calculator.test.js");
                    setStackTrace(
                      "TypeError: Cannot read properties of undefined (reading 'length')\n    at calculateAverage (test-fixtures/node-target/src/calculator.js:5:17)\n    at Object.<anonymous> (test-fixtures/node-target/test/calculator.test.js:6:3)"
                    );
                    setSimulate(false);
                  }}
                  className="py-1.5 px-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-[11px] font-mono text-slate-300 hover:text-white transition-all text-center"
                >
                  Node.js
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRepoUrl("https://github.com/VinayakGaikwad101/hydra-mdm-project");
                    setBranch("main");
                    setTestCommand("python3 test-fixtures/python-target/tests/test_pricing.py");
                    setStackTrace(
                      "ZeroDivisionError: division by zero\n  File \"test-fixtures/python-target/src/pricing.py\", line 5, in compute_discount\n    discount_amount = price * (discount_percent / 0)\n  File \"test-fixtures/python-target/tests/test_pricing.py\", line 4, in test_discount\n    assert compute_discount(100.0, 20.0) == 80.0"
                    );
                    setSimulate(false);
                  }}
                  className="py-1.5 px-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-[11px] font-mono text-slate-300 hover:text-white transition-all text-center"
                >
                  Python
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRepoUrl("https://github.com/VinayakGaikwad101/hydra-mdm-project");
                    setBranch("main");
                    setTestCommand("mvn test -f test-fixtures/java-target/pom.xml");
                    setStackTrace(
                      "java.lang.ArithmeticException: / by zero\n\tat com.hydra.MathOps.divide(test-fixtures/java-target/src/main/java/com/hydra/MathOps.java:6)"
                    );
                    setSimulate(false);
                  }}
                  className="py-1.5 px-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-[11px] font-mono text-slate-300 hover:text-white transition-all text-center"
                >
                  Java (Maven)
                </button>
              </div>
            </div>

            {/* Prominent Dispatch Button right below the form */}
            <button
              onClick={handleRunPipeline}
              disabled={isRunning}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all disabled:opacity-50 mt-2"
            >
              {isRunning ? (
                <>
                  <Spinner size="sm" className="border-white" />
                  <span>Running Self-Healing Pipeline...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  <span>Dispatch Self-Heal</span>
                </>
              )}
            </button>
          </div>

          {/* Right Column: AST Call Hierarchy (8 Cols) */}
          <div className="lg:col-span-8 bg-[#111827] border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-500" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                  AST Call Hierarchy & Code Structure
                </h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-950/80 text-blue-400 border border-blue-800/80">
                React Flow Interactive
              </span>
            </div>

            {/* AST Canvas Container */}
            <div className="h-[360px] w-full rounded-xl border border-slate-800 overflow-hidden bg-slate-950/80">
              {isRunning && runResult.astNodes.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-3">
                  <Spinner size="md" />
                  <p className="text-xs font-mono text-slate-400">AST parser traversing symbol tree...</p>
                </div>
              ) : (
                <ASTVisualizer
                  nodes={runResult.astNodes}
                  links={runResult.astLinks}
                  targetFunction={runResult.failingFile}
                />
              )}
            </div>
          </div>
        </div>

        {/* Bottom Split: Live Execution Telemetry & Synthesized Patch */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Live Terminal Telemetry (6 Cols) */}
          <div className="lg:col-span-6 bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-slate-200">
                <TerminalIcon className="h-4 w-4 text-emerald-400" />
                <h2 className="text-xs font-bold font-mono tracking-wider uppercase">Live Execution Telemetry</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-mono text-slate-400">SSE Stream Active</span>
              </div>
            </div>

            <div className="h-64 overflow-y-auto font-mono text-xs text-slate-300 p-3 bg-slate-900/40 rounded-xl border border-slate-800/80 space-y-1.5 scrollbar-thin">
              {logs.length === 0 ? (
                <p className="text-slate-600">Waiting for pipeline trigger...</p>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="leading-relaxed whitespace-pre-wrap">
                    {log}
                  </div>
                ))
              )}
              <div ref={terminalEndRef} />
            </div>
          </div>

          {/* Synthesized Patch & Code Review (6 Cols) */}
          <div className="lg:col-span-6 bg-[#111827] border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <GitPullRequest className="h-4 w-4 text-blue-500" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                  Synthesized Patch Review
                </h2>
              </div>
              {runResult.status === "completed" && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Sandbox Verified</span>
                </span>
              )}
            </div>

            {runResult.explanation ? (
              <div className="space-y-3">
                <div className="p-3 bg-blue-950/30 border border-blue-800/50 rounded-xl text-xs text-slate-300">
                  <span className="font-semibold text-blue-400">Fix Summary: </span>
                  {runResult.explanation}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="block text-[11px] font-mono text-red-400 font-semibold mb-1">Failing Code</span>
                    <pre className="p-3 rounded-xl bg-red-950/30 border border-red-900/50 font-mono text-xs text-red-300 overflow-x-auto max-h-36">
                      {runResult.targetContent || "No target"}
                    </pre>
                  </div>
                  <div>
                    <span className="block text-[11px] font-mono text-emerald-400 font-semibold mb-1">
                      Synthesized Fix
                    </span>
                    <pre className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-900/50 font-mono text-xs text-emerald-300 overflow-x-auto max-h-36">
                      {runResult.replacementContent || "No replacement"}
                    </pre>
                  </div>
                </div>
              </div>
            ) : isRunning ? (
              <div className="space-y-3 py-4">
                <Skeleton className="h-10 w-full" />
                <div className="grid grid-cols-2 gap-3">
                  <Skeleton className="h-28 w-full" />
                  <Skeleton className="h-28 w-full" />
                </div>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs font-mono">
                <Code2 className="h-8 w-8 mb-2 opacity-50 text-slate-500" />
                <span>No patch synthesized yet.</span>
                <span>Click &quot;Dispatch Self-Heal&quot; to run Critic, Coder & QA Sandbox agents.</span>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
