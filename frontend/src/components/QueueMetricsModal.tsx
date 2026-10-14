"use client";

import React, { useEffect, useState } from "react";
import { Activity, Clock, CheckCircle2, XCircle, RotateCcw, Cpu } from "lucide-react";

interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

interface JobItem {
  id: string;
  name: string;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  data: {
    runId?: string;
    repoUrl?: string;
    branch?: string;
    testCommand?: string;
  };
  failedReason?: string;
}

interface QueueMetricsProps {
  backendUrl: string;
}

export function QueueMetricsModal({
  backendUrl,
  isOpen,
  onClose,
}: QueueMetricsProps & { isOpen: boolean; onClose: () => void }) {
  const [counts, setCounts] = useState<QueueCounts | null>(null);
  const [activeJobs, setActiveJobs] = useState<JobItem[]>([]);
  const [waitingJobs, setWaitingJobs] = useState<JobItem[]>([]);
  const [failedJobs, setFailedJobs] = useState<JobItem[]>([]);
  const [completedJobs, setCompletedJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "active" | "waiting" | "failed" | "completed">("overview");

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${backendUrl}/api/queue/metrics`);
      const data = await res.json();
      if (data.success) {
        setCounts(data.counts);
        setActiveJobs(data.active || []);
        setWaitingJobs(data.waiting || []);
        setFailedJobs(data.failed || []);
        setCompletedJobs(data.completed || []);
      }
    } catch (e) {
      console.error("Failed to fetch queue metrics:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMetrics();
      const interval = setInterval(fetchMetrics, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen, backendUrl]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#111827] border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                BullMQ Live Telemetry & Worker Queues
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Redis queue: <span className="text-blue-400">hydra-pipeline-queue</span> (Polled live every 3s)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchMetrics}
              disabled={loading}
              title="Refresh Queue Metrics"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-white transition-all text-xs font-mono disabled:opacity-50 cursor-pointer"
            >
              <RotateCcw className={`w-3.5 h-3.5 text-blue-400 ${loading ? "animate-spin" : ""}`} />
              <span>{loading ? "Refreshing..." : "Refresh"}</span>
            </button>
            <button
              onClick={onClose}
              className="px-2.5 py-1.5 text-xs font-mono text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 rounded-lg border border-slate-800 transition-all cursor-pointer"
            >
              Esc ✕
            </button>
          </div>
        </div>

        {/* Counter Metric Cards */}
        <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-3 border-b border-slate-800/80 bg-[#0d121f]">
          <div className="p-3 rounded-xl border border-blue-900/40 bg-blue-950/20">
            <div className="flex items-center justify-between text-blue-400 text-xs font-mono mb-1">
              <span>Active</span>
              <Activity className="w-3.5 h-3.5 animate-pulse" />
            </div>
            <div className="text-2xl font-bold font-mono text-white">{counts?.active ?? 0}</div>
            <div className="text-[10px] text-slate-400">Currently executing in sandbox</div>
          </div>

          <div className="p-3 rounded-xl border border-amber-900/40 bg-amber-950/20">
            <div className="flex items-center justify-between text-amber-400 text-xs font-mono mb-1">
              <span>Waiting</span>
              <Clock className="w-3.5 h-3.5" />
            </div>
            <div className="text-2xl font-bold font-mono text-white">{counts?.waiting ?? 0}</div>
            <div className="text-[10px] text-slate-400">Pending worker thread</div>
          </div>

          <div className="p-3 rounded-xl border border-emerald-900/40 bg-emerald-950/20">
            <div className="flex items-center justify-between text-emerald-400 text-xs font-mono mb-1">
              <span>Completed</span>
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <div className="text-2xl font-bold font-mono text-white">{counts?.completed ?? 0}</div>
            <div className="text-[10px] text-slate-400">Verified & healed runs</div>
          </div>

          <div className="p-3 rounded-xl border border-red-900/40 bg-red-950/20">
            <div className="flex items-center justify-between text-red-400 text-xs font-mono mb-1">
              <span>Failed</span>
              <XCircle className="w-3.5 h-3.5" />
            </div>
            <div className="text-2xl font-bold font-mono text-white">{counts?.failed ?? 0}</div>
            <div className="text-[10px] text-slate-400">Unresolved pipeline jobs</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-slate-800 flex gap-4 text-xs font-medium">
          {(["overview", "active", "waiting", "completed", "failed"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 capitalize border-b-2 transition-all ${
                activeTab === tab
                  ? "border-blue-500 text-blue-400 font-semibold"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content List */}
        <div className="p-6 overflow-y-auto flex-1 space-y-3 font-mono text-xs">
          {activeTab === "overview" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-2">
                <div className="text-xs font-semibold text-slate-200">Architecture & Concurrency Profile</div>
                <div className="grid grid-cols-2 gap-4 text-[11px] text-slate-400">
                  <div>
                    <span className="text-slate-500 block">Queue Engine:</span>
                    BullMQ (Redis Streams backed)
                  </div>
                  <div>
                    <span className="text-slate-500 block">Worker Concurrency:</span>
                    1 (Sequential isolated Docker containers)
                  </div>
                  <div>
                    <span className="text-slate-500 block">Delayed Jobs:</span>
                    {counts?.delayed ?? 0}
                  </div>
                  <div>
                    <span className="text-slate-500 block">Paused Jobs:</span>
                    {counts?.paused ?? 0}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-300 mb-2">Recent Pipeline Jobs</div>
                {[...activeJobs, ...waitingJobs, ...completedJobs.slice(0, 5), ...failedJobs.slice(0, 5)].length === 0 ? (
                  <div className="text-slate-500 text-center py-8">No recent jobs found in BullMQ.</div>
                ) : (
                  <div className="space-y-2">
                    {[...activeJobs, ...waitingJobs, ...completedJobs.slice(0, 5), ...failedJobs.slice(0, 5)].map((j) => (
                      <div
                        key={j.id}
                        className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-blue-400 font-bold">Job #{j.id}</span>
                            <span className="text-[10px] text-slate-500">{new Date(j.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <div className="text-[11px] text-slate-300 mt-0.5 truncate max-w-md">
                            {j.data.testCommand || "Custom command"}
                          </div>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-300">
                          Run: {j.data.runId ? j.data.runId.slice(0, 8) : "N/A"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "active" && (
            <div className="space-y-2">
              {activeJobs.length === 0 ? (
                <div className="text-center py-10 text-slate-500">No active jobs executing right now.</div>
              ) : (
                activeJobs.map((j) => (
                  <div key={j.id} className="p-3 rounded-xl border border-blue-900/60 bg-blue-950/20">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-blue-300 font-bold">Job #{j.id}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-900/60 text-blue-200">Active</span>
                    </div>
                    <div className="text-slate-300 text-[11px]">Command: {j.data.testCommand}</div>
                    <div className="text-slate-400 text-[10px]">Repo: {j.data.repoUrl} ({j.data.branch})</div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "waiting" && (
            <div className="space-y-2">
              {waitingJobs.length === 0 ? (
                <div className="text-center py-10 text-slate-500">Queue is empty. No jobs waiting.</div>
              ) : (
                waitingJobs.map((j) => (
                  <div key={j.id} className="p-3 rounded-xl border border-amber-900/60 bg-amber-950/20">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-amber-300 font-bold">Job #{j.id}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-amber-900/60 text-amber-200">Waiting</span>
                    </div>
                    <div className="text-slate-300 text-[11px]">Command: {j.data.testCommand}</div>
                    <div className="text-slate-400 text-[10px]">Repo: {j.data.repoUrl} ({j.data.branch})</div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "completed" && (
            <div className="space-y-2">
              {completedJobs.length === 0 ? (
                <div className="text-center py-10 text-slate-500">No completed jobs in current Redis buffer.</div>
              ) : (
                completedJobs.map((j) => (
                  <div key={j.id} className="p-3 rounded-xl border border-emerald-900/60 bg-emerald-950/20">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-emerald-300 font-bold">Job #{j.id}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-200">Success</span>
                    </div>
                    <div className="text-slate-300 text-[11px]">Command: {j.data.testCommand}</div>
                    <div className="text-slate-400 text-[10px]">Run ID: {j.data.runId}</div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "failed" && (
            <div className="space-y-2">
              {failedJobs.length === 0 ? (
                <div className="text-center py-10 text-slate-500">No failed jobs recorded.</div>
              ) : (
                failedJobs.map((j) => (
                  <div key={j.id} className="p-3 rounded-xl border border-red-900/60 bg-red-950/20">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-red-300 font-bold">Job #{j.id}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-red-900/60 text-red-200">Failed</span>
                    </div>
                    <div className="text-red-300 text-[11px] mb-1">Reason: {j.failedReason || "Test or Sandbox failure"}</div>
                    <div className="text-slate-400 text-[10px]">Command: {j.data.testCommand}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
