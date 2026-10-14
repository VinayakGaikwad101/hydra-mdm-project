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
import { Layers, Terminal, Box } from "lucide-react";

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
  nodes: ASTNodeData[];
  links: ASTLinkData[];
  targetFunction?: string;
}

// Custom Styled Node Component
function CustomASTNode({ data }: { data: ASTNodeData & { isTarget?: boolean } }) {
  const getBadgeColor = () => {
    switch (data.type) {
      case "class":
        return "bg-amber-100 text-amber-900 border-amber-300";
      case "function":
        return "bg-stone-100 text-stone-800 border-stone-300";
      default:
        return "bg-zinc-100 text-zinc-700 border-zinc-200";
    }
  };

  return (
    <div
      className={`px-3.5 py-2 rounded-lg border bg-white shadow-xs min-w-[140px] transition ${
        data.isTarget
          ? "border-emerald-600 ring-2 ring-emerald-500/20 shadow-sm"
          : "border-stone-200 hover:border-stone-400"
      }`}
    >
      <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-stone-400" />
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-stone-900 truncate">
          {data.name}
        </span>
        <span
          className={`text-[9px] uppercase tracking-wider font-mono font-medium px-1.5 py-0.5 rounded border ${getBadgeColor()}`}
        >
          {data.type}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1 text-[10px] text-stone-400 font-mono">
        <Terminal className="w-2.5 h-2.5" />
        <span>Line {data.line}</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-stone-400" />
    </div>
  );
}

const nodeTypes = {
  astNode: CustomASTNode,
};

export function ASTVisualizer({ nodes = [], links = [], targetFunction }: ASTVisualizerProps) {
  // Map raw AST data into React Flow Nodes with circular/grid layout
  const flowNodes: Node[] = useMemo(() => {
    if (nodes.length === 0) {
      return [
        {
          id: "empty",
          type: "default",
          position: { x: 200, y: 120 },
          data: { label: "No AST parsed yet. Run a pipeline to inspect code structure." },
          style: {
            background: "#fafaf9",
            border: "1px dashed #d6d3d1",
            color: "#78716c",
            fontFamily: "monospace",
            fontSize: "12px",
            padding: "16px",
            borderRadius: "8px",
          },
        },
      ];
    }

    const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(nodes.length))));
    const xGap = 200;
    const yGap = 110;

    return nodes.map((node, i) => {
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
  }, [nodes, targetFunction]);

  // Map links into clean orthogonal React Flow Edges
  const flowEdges: Edge[] = useMemo(() => {
    return links.map((link, i) => ({
      id: `edge-${i}-${link.caller}-${link.callee}`,
      source: link.caller,
      target: link.callee,
      type: "smoothstep",
      animated: true,
      style: { stroke: "#78716c", strokeWidth: 1.5 },
    }));
  }, [links]);

  return (
    <div className="h-[360px] w-full rounded-xl border border-stone-200/90 bg-stone-50/50 overflow-hidden relative shadow-2xs">
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 bg-white/90 backdrop-blur rounded border border-stone-200 text-xs font-mono text-stone-700 shadow-2xs">
        <Layers className="w-3.5 h-3.5 text-stone-500" />
        <span>Abstract Syntax Tree (AST Architecture)</span>
      </div>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.4}
        maxZoom={1.5}
      >
        <Background color="#e7e5e4" gap={16} />
        <Controls className="!bg-white !border-stone-200 !shadow-xs !rounded-md" />
        <MiniMap
          nodeColor="#e7e5e4"
          maskColor="rgba(250, 250, 249, 0.7)"
          className="!bg-white !border-stone-200 !rounded-md !shadow-2xs"
        />
      </ReactFlow>
    </div>
  );
}
