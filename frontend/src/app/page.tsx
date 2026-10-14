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
  Cpu,
  RefreshCw,
  Sun,
  Moon,
  LogIn,
  LogOut,
  User as UserIcon,
  Activity,
  FileCode2,
  Zap,
  Sparkles,
} from "lucide-react";
import { ASTVisualizer } from "@/components/ASTVisualizer";
import { Spinner, Skeleton } from "@/components/ui/Feedback";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { AuthModal } from "@/components/AuthModal";

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
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState("https://github.com/expressjs/express");
  const [branch, setBranch] = useState("master");
  const [testCommand, setTestCommand] = useState("npm test");
  const [stackTrace, setStackTrace] = useState(
    "TypeError: Cannot read properties of undefined (reading 'length')\n    at average (src/calculator.js:4:16)\n    at Object.<anonymous> (test/calculator.test.js:12:5)"
  );
  const [simulate, setSimulate] = useState(true);

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

  const handleRunPipeline = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setLogs(["[Hydra Client] Initiating pipeline dispatch to BullMQ worker..."]);
    setRunResult((prev) => ({ ...prev, status: "running" }));

    try {
      const res = await fetch(`${BACKEND_URL}/api/pipeline/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl,
          branch,
          testCommand,
          stackTraceInput: stackTrace,
          simulate,
          userId: user?.id || "guest",
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
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0b0f19] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Navigation Bar */}
      <header className="sticky top-0 z-40 h-16 border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-6 flex items-center justify-between transition-colors">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-lg shadow-md shadow-blue-500/20">
            H
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-slate-900 dark:text-white text-base">HYDRA</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/80">
                Autonomous CI/CD
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">Self-Healing AST Agent Fleet</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Active Model Pill */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950/60 text-xs font-mono text-slate-700 dark:text-slate-300">
            <Cpu className="h-3.5 w-3.5 text-blue-500" />
            <span>gemini-3.1-flash-lite</span>
          </div>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle Theme"
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-all shadow-sm"
          >
            {theme === "dark" ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-600" />}
          </button>

          {/* User Auth Info */}
          {user ? (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
              <div className="h-8 w-8 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-xs uppercase">
                {user.name.charAt(0)}
              </div>
              <div className="hidden md:block text-left text-xs">
                <div className="font-semibold text-slate-800 dark:text-slate-200">{user.name}</div>
                <div className="text-[10px] text-slate-400">{user.email}</div>
              </div>
              <button
                onClick={logout}
                title="Logout"
                className="p-2 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAuthModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-md shadow-blue-500/20 active:scale-95 transition-all"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Sign In</span>
            </button>
          )}

          {/* Dispatch Button */}
          <button
            onClick={handleRunPipeline}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <Spinner size="sm" className="border-white" />
                <span>Running Pipeline...</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Dispatch Self-Heal</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-6 max-w-[1600px] w-full mx-auto space-y-6">
        {/* Top Split: Configuration & AST Visualizer */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Pipeline Targets (4 Cols) */}
          <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <FileCode2 className="h-4 w-4 text-blue-500" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Pipeline Target
                </h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                Queue Mode
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Repository URL
              </label>
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                className="w-full px-3.5 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Branch
                </label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Test Command
                </label>
                <input
                  type="text"
                  value={testCommand}
                  onChange={(e) => setTestCommand(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Failing CI/CD Stack Trace
              </label>
              <textarea
                rows={5}
                value={stackTrace}
                onChange={(e) => setStackTrace(e.target.value)}
                className="w-full p-3 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-none transition-all"
              />
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={simulate}
                  onChange={(e) => setSimulate(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <span>Demo Simulation Workspace</span>
              </label>
              <span className="text-[11px] text-slate-400 font-mono">Zero Sandboxing Lag</span>
            </div>
          </div>

          {/* Right Column: AST Call Hierarchy (8 Cols) */}
          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-3 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-500" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  AST Call Hierarchy & Code Structure
                </h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/80">
                React Flow Interactive Graph
              </span>
            </div>

            {/* AST Canvas Container */}
            <div className="h-[360px] w-full rounded-xl border border-slate-200 dark:border-slate-800/90 overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
              {isRunning && runResult.astNodes.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-3">
                  <Spinner size="md" />
                  <p className="text-xs font-mono text-slate-500">Babel/Python AST parser traversing symbol tree...</p>
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

            <div className="h-64 overflow-y-auto font-mono text-xs text-slate-300 p-3 bg-slate-900/60 rounded-xl border border-slate-800/80 space-y-1.5 scrollbar-thin">
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
          <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-3 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <GitPullRequest className="h-4 w-4 text-blue-500" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Synthesized Patch Review
                </h2>
              </div>
              {runResult.status === "completed" && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Sandbox Verified</span>
                </span>
              )}
            </div>

            {runResult.explanation ? (
              <div className="space-y-3">
                <div className="p-3 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800/50 rounded-xl text-xs text-slate-700 dark:text-slate-300">
                  <span className="font-semibold text-blue-600 dark:text-blue-400">Fix Summary: </span>
                  {runResult.explanation}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="block text-[11px] font-mono text-red-500 font-semibold mb-1">Failing Code</span>
                    <pre className="p-3 rounded-xl bg-red-50/60 dark:bg-red-950/30 border border-red-200/80 dark:border-red-900/50 font-mono text-xs text-red-700 dark:text-red-300 overflow-x-auto max-h-36">
                      {runResult.targetContent || "No target"}
                    </pre>
                  </div>
                  <div>
                    <span className="block text-[11px] font-mono text-emerald-500 font-semibold mb-1">
                      Synthesized Fix
                    </span>
                    <pre className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/50 font-mono text-xs text-emerald-700 dark:text-emerald-300 overflow-x-auto max-h-36">
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
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-slate-400 dark:text-slate-500 text-xs font-mono">
                <Code2 className="h-8 w-8 mb-2 opacity-50 text-slate-400" />
                <span>No patch synthesized yet.</span>
                <span>Click &quot;Dispatch Self-Heal&quot; to run Critic, Coder & QA Sandbox agents.</span>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Auth Modal Component */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        backendUrl={BACKEND_URL}
      />
    </div>
  );
}
