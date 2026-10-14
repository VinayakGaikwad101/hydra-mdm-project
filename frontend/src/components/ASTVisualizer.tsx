"use client";

import React, { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Position,
  Handle,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Layers, Terminal } from "lucide-react";

interface ASTNodeData {
  name: string;
  type: "function" | "class" | "variable";
  line: number;
}

interface ASTLinkData {
  caller: string;
  callee: string;
  line: number;
}

interface ASTVisualizerProps {
  nodes?: ASTNodeData[];
  links?: ASTLinkData[];
  targetFunction?: string;
}

// Default pre-drawn AST structure for instant preview
const DEMO_NODES: ASTNodeData[] = [
  { name: "average(arr)", type: "function", line: 1 },
  { name: "Array.reduce()", type: "function", line: 3 },
  { name: "Array.length", type: "variable", line: 4 },
  { name: "calculator.test.js", type: "function", line: 12 },
];

const DEMO_LINKS: ASTLinkData[] = [
  { caller: "calculator.test.js", callee: "average(arr)", line: 12 },
  { caller: "average(arr)", callee: "Array.reduce()", line: 3 },
  { caller: "average(arr)", callee: "Array.length", line: 4 },
];

function CustomASTNode({ data }: { data: ASTNodeData & { isTarget?: boolean } }) {
  const getBadgeColor = () => {
    switch (data.type) {
      case "class":
        return "bg-amber-950/60 text-amber-300 border-amber-800/80";
      case "function":
        return "bg-blue-950/60 text-blue-300 border-blue-800/80";
      default:
        return "bg-slate-800 text-slate-300 border-slate-700";
    }
  };

  return (
    <div
      className={`px-3.5 py-2.5 rounded-xl border bg-[#111827] shadow-lg min-w-[150px] transition-all ${
        data.isTarget
          ? "border-red-500 ring-2 ring-red-500/30"
          : "border-slate-800 hover:border-blue-500/60"
      }`}
    >
      <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-blue-500 !border-0" />
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-slate-100 truncate">
          {data.name}
        </span>
        <span
          className={`text-[9px] uppercase tracking-wider font-mono font-medium px-1.5 py-0.5 rounded border ${getBadgeColor()}`}
        >
          {data.type}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400 font-mono">
        <Terminal className="w-2.5 h-2.5 text-blue-400" />
        <span>Line {data.line}</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-blue-500 !border-0" />
    </div>
  );
}

const nodeTypes = {
  astNode: CustomASTNode,
};

export function ASTVisualizer({ nodes = [], links = [], targetFunction }: ASTVisualizerProps) {
  // Use parsed nodes, or fallback to the pre-drawn AST structure
  const activeNodes = nodes.length > 0 ? nodes : DEMO_NODES;
  const activeLinks = links.length > 0 ? links : DEMO_LINKS;

  const flowNodes: Node[] = useMemo(() => {
    const cols = Math.min(3, Math.max(2, Math.ceil(Math.sqrt(activeNodes.length))));
    const xGap = 210;
    const yGap = 120;

    return activeNodes.map((node, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const isTarget = targetFunction && node.name.toLowerCase().includes(targetFunction.toLowerCase());

      return {
        id: node.name,
        type: "astNode",
        position: { x: col * xGap + 40, y: row * yGap + 40 },
        data: {
          ...node,
          isTarget: Boolean(isTarget),
        },
      };
    });
  }, [activeNodes, targetFunction]);

  const flowEdges: Edge[] = useMemo(() => {
    return activeLinks.map((link, i) => ({
      id: `edge-${i}-${link.caller}-${link.callee}`,
      source: link.caller,
      target: link.callee,
      type: "smoothstep",
      animated: true,
      style: { stroke: "#3b82f6", strokeWidth: 1.5 },
    }));
  }, [activeLinks]);

  return (
    <div className="h-full w-full relative bg-[#0b0f19]">
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 bg-slate-900/90 backdrop-blur rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 shadow-md">
        <Layers className="w-3.5 h-3.5 text-blue-400" />
        <span>{nodes.length > 0 ? "AST Live Hierarchy" : "AST Symbol Call Graph"}</span>
      </div>

      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        minZoom={0.4}
        maxZoom={1.5}
      >
        <Background color="#1e293b" gap={16} />
        <Controls className="!bg-slate-900 !border-slate-800 !text-white !rounded-xl !overflow-hidden !shadow-lg" />
        <MiniMap
          nodeColor="#1e293b"
          maskColor="rgba(11, 15, 25, 0.75)"
          className="!bg-slate-900 !border-slate-800 !rounded-xl !overflow-hidden !shadow-lg"
        />
      </ReactFlow>
    </div>
  );
}
