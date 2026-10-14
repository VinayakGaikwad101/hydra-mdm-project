import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import * as parser from "@babel/parser";
import traverseModule from "@babel/traverse";

// Handle Babel traverse default export differences across ESM/CJS
const traverse = (traverseModule as any).default || traverseModule;

export interface ASTNode {
  name: string;
  type: "function" | "class" | "variable";
  line: number;
}

export interface ASTLink {
  caller: string;
  callee: string;
  line: number;
}

export interface ASTAnalysisResult {
  nodes: ASTNode[];
  links: ASTLink[];
  error?: string;
}

export function getASTAnalysis(filePath: string): ASTAnalysisResult {
  const ext = path.extname(filePath).toLowerCase();

  // Python AST parsing via embedded script
  if (ext === ".py") {
    try {
      const parserScript = path.join(__dirname, "parse_ast.py");
      const stdout = execSync(`python "${parserScript}" "${filePath}"`, { encoding: "utf-8" });
      return JSON.parse(stdout) as ASTAnalysisResult;
    } catch (err: any) {
      return { nodes: [], links: [], error: `Python AST parser failed: ${err.message}` };
    }
  }

  // Modern JavaScript, TypeScript, JSX, TSX via Babel Parser
  if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(ext)) {
    try {
      const code = fs.readFileSync(filePath, "utf-8");

      const ast = parser.parse(code, {
        sourceType: "unambiguous",
        plugins: [
          "typescript",
          "jsx",
          "classProperties",
          "asyncDoExpressions",
          "decorators-legacy",
          "dynamicImport",
          "exportDefaultFrom",
        ],
      });

      const nodes: ASTNode[] = [];
      const links: ASTLink[] = [];
      let currentScope: string | null = null;
      let currentClass: string | null = null;

      traverse(ast, {
        ClassDeclaration(nodePath: any) {
          const name = nodePath.node.id?.name || "AnonymousClass";
          nodes.push({
            name,
            type: "class",
            line: nodePath.node.loc?.start.line || 1,
          });
          currentClass = name;
        },
        ClassMethod(nodePath: any) {
          const name = nodePath.node.key.name || "method";
          const fullName = currentClass ? `${currentClass}.${name}` : name;
          nodes.push({
            name: fullName,
            type: "function",
            line: nodePath.node.loc?.start.line || 1,
          });
          currentScope = fullName;
        },
        FunctionDeclaration(nodePath: any) {
          const name = nodePath.node.id?.name || "anonymousFunction";
          const fullName = currentClass ? `${currentClass}.${name}` : name;
          nodes.push({
            name: fullName,
            type: "function",
            line: nodePath.node.loc?.start.line || 1,
          });
          currentScope = fullName;
        },
        VariableDeclarator(nodePath: any) {
          const init = nodePath.node.init;
          if (init && (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression")) {
            const name = nodePath.node.id.name;
            const fullName = currentClass ? `${currentClass}.${name}` : name;
            nodes.push({
              name: fullName,
              type: "function",
              line: nodePath.node.loc?.start.line || 1,
            });
            currentScope = fullName;
          }
        },
        CallExpression(nodePath: any) {
          const caller = currentScope || "global";
          let callee = "";

          if (nodePath.node.callee.type === "Identifier") {
            callee = nodePath.node.callee.name;
          } else if (nodePath.node.callee.type === "MemberExpression") {
            const obj = nodePath.node.callee.object;
            const prop = nodePath.node.callee.property;
            if (obj.type === "Identifier") {
              callee = `${obj.name}.${prop.name || prop.value}`;
            } else {
              callee = prop.name || prop.value || "call";
            }
          }

          if (callee && callee !== "require") {
            links.push({
              caller,
              callee,
              line: nodePath.node.loc?.start.line || 1,
            });
          }
        },
      });

      // Deduplicate nodes
      const uniqueMap = new Map<string, ASTNode>();
      nodes.forEach((n) => uniqueMap.set(`${n.type}-${n.name}`, n));

      return {
        nodes: Array.from(uniqueMap.values()),
        links: links.filter((l) => l.caller !== "global" || l.callee !== "require"),
      };
    } catch (err: any) {
      return { nodes: [], links: [], error: `Babel AST Parser error: ${err.message}` };
    }
  }

  return { nodes: [], links: [], error: `Unsupported file extension for AST parsing: ${ext}` };
}
