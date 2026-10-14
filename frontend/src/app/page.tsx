"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  Terminal as TerminalIcon,
  GitPullRequest,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Code,
  Layers,
  Cpu,
  RefreshCw,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { ASTVisualizer } from "@/components/ASTVisualizer";
import { Spinner, Skeleton } from "@/components/ui/Feedback";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5001";

interface RunResult {
  runId: string;
  status: "idle" | "running" | "success" | "failed";
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
    setLogs(["[Hydra Client] Initiating pipeline dispatch to background BullMQ worker..."]);
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
        setRunResult((prev) => ({
          ...prev,
          status: payload.success ? "success" : "failed",
        }));
        setIsRunning(false);
        eventSource.close();
      });

      eventSource.onerror = () => {
        setLogs((prev) => [...prev, "[Stream] Pipeline execution stream closed."]);
        setIsRunning(false);
        eventSource.close();
      };
    } catch (err: any) {
      setLogs((prev) => [...prev, `[Error] ${err.message}`]);
      setRunResult((prev) => ({ ...prev, status: "failed" }));
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fbfbfd] text-stone-900 flex flex-col font-sans">
      {/* Top Header */}
      <header className="h-14 border-b border-stone-200/90 bg-white/90 backdrop-blur sticky top-0 z-30 px-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-stone-900 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
            H
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-stone-900">HYDRA</h1>
            <p className="text-[10px] text-stone-400 font-mono">Autonomous Self-Healing CI/CD Agent</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-stone-100 rounded text-xs font-mono text-stone-600 border border-stone-200">
            <Cpu className="w-3.5 h-3.5 text-stone-500" />
            <span>gemini-3.1-flash-lite</span>
          </div>

          <button
            onClick={handleRunPipeline}
            disabled={isRunning}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white rounded-md text-xs font-medium transition shadow-2xs cursor-pointer"
          >
            {isRunning ? <Spinner size="sm" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{isRunning ? "Running Pipeline..." : "Dispatch Self-Heal"}</span>
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Configuration & Status (4 cols) */}
        <section className="lg:col-span-4 space-y-4">
          {/* Target Repo Card */}
          <div className="bg-white border border-stone-200/90 rounded-xl p-4 space-y-3 shadow-xs">
            <h2 className="text-xs font-semibold text-stone-800 uppercase tracking-wider font-mono">
              Pipeline Targets
            </h2>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block text-stone-500 mb-1 font-medium text-[11px]">Repository URL</label>
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-md border border-stone-200 bg-stone-50/50 text-stone-800 font-mono text-xs focus:outline-none focus:border-stone-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-stone-500 mb-1 font-medium text-[11px]">Branch</label>
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-md border border-stone-200 bg-stone-50/50 text-stone-800 font-mono text-xs focus:outline-none focus:border-stone-800"
                  />
                </div>
                <div>
                  <label className="block text-stone-500 mb-1 font-medium text-[11px]">Test Command</label>
                  <input
                    type="text"
                    value={testCommand}
                    onChange={(e) => setTestCommand(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-md border border-stone-200 bg-stone-50/50 text-stone-800 font-mono text-xs focus:outline-none focus:border-stone-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-stone-500 mb-1 font-medium text-[11px]">Failing Stack Trace</label>
                <textarea
                  rows={4}
                  value={stackTrace}
                  onChange={(e) => setStackTrace(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-stone-200 bg-stone-50/50 text-stone-800 font-mono text-[11px] leading-relaxed focus:outline-none focus:border-stone-800"
                />
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-stone-100">
                <span className="text-[11px] text-stone-500">Fast Demo Simulation</span>
                <input
                  type="checkbox"
                  checked={simulate}
                  onChange={(e) => setSimulate(e.target.checked)}
                  className="rounded border-stone-300 text-stone-900 focus:ring-0 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Triaged Fault Summary */}
          {runResult.errorSummary && (
            <div className="bg-white border border-stone-200/90 rounded-xl p-4 space-y-2 shadow-xs animate-in fade-in-50">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-800 uppercase tracking-wider font-mono">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>Critic Triage Report</span>
              </div>
              <p className="text-xs text-stone-700 leading-relaxed">{runResult.errorSummary}</p>
              {runResult.failingFile && (
                <div className="text-[11px] font-mono text-stone-500 pt-1 border-t border-stone-100">
                  Target: {runResult.failingFile}:{runResult.lineNumber}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right Column: React Flow AST & Terminal Output (8 cols) */}
        <section className="lg:col-span-8 space-y-6">
          {/* React Flow AST Visualizer */}
          <div className="bg-white border border-stone-200/90 rounded-xl p-4 space-y-3 shadow-xs">
            <h2 className="text-xs font-semibold text-stone-800 uppercase tracking-wider font-mono">
              AST Call Hierarchy & Code Structure
            </h2>
            <ASTVisualizer
              nodes={runResult.astNodes}
              links={runResult.astLinks}
              targetFunction={runResult.failingFile}
            />
          </div>

          {/* Proposed Patch & Diff View */}
          {runResult.targetContent && (
            <div className="bg-white border border-stone-200/90 rounded-xl p-4 space-y-3 shadow-xs animate-in fade-in-50">
              <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-800 uppercase tracking-wider font-mono">
                  <Code className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Synthesized Unified Patch</span>
                </div>
                {runResult.status === "success" && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3" />
                    Verified in Sandbox
                  </span>
                )}
              </div>

              <div className="text-xs font-mono bg-stone-900 text-stone-100 p-3.5 rounded-lg overflow-x-auto space-y-1">
                <div className="text-rose-400 bg-rose-950/40 px-2 py-0.5 rounded">
                  - {runResult.targetContent}
                </div>
                <div className="text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded">
                  + {runResult.replacementContent}
                </div>
              </div>
            </div>
          )}

          {/* Real-time Streaming Terminal */}
          <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 space-y-2 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-stone-800">
              <div className="flex items-center gap-2">
                <TerminalIcon className="w-3.5 h-3.5 text-stone-400" />
                <h3 className="text-xs font-mono font-medium text-stone-300">Live Agent Execution Telemetry</h3>
              </div>
              {isRunning && <span className="text-[10px] text-amber-400 font-mono animate-pulse">● Streaming</span>}
            </div>

            <div className="h-56 overflow-y-auto font-mono text-[11px] text-stone-300 space-y-1 leading-relaxed">
              {logs.length === 0 ? (
                <div className="text-stone-600 italic">Waiting for pipeline trigger...</div>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="whitespace-pre-wrap">
                    {log}
                  </div>
                ))
              )}
              <div ref={terminalEndRef} />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
