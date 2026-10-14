import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import * as parser from "@babel/parser";
import traverseModule from "@babel/traverse";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      let parserScript = path.join(__dirname, "parse_ast.py");
      if (!fs.existsSync(parserScript)) {
        parserScript = path.join(process.cwd(), "src", "parser", "parse_ast.py");
      }
      if (!fs.existsSync(parserScript)) {
        parserScript = path.join(process.cwd(), "dist", "parser", "parse_ast.py");
      }
      const pyCmd = process.platform === "win32" ? "python" : "python3";
      const stdout = execSync(`${pyCmd} "${parserScript}" "${filePath}"`, { encoding: "utf-8" });
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
          "doExpressions",
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
        AssignmentExpression(nodePath: any) {
          const left = nodePath.node.left;
          const right = nodePath.node.right;
          // module.exports = function(...) { ... } or exports.foo = ...
          if (
            (left.type === "MemberExpression" &&
              ((left.object?.name === "module" && left.property?.name === "exports") ||
                left.object?.name === "exports")) &&
            (right.type === "FunctionExpression" || right.type === "ArrowFunctionExpression")
          ) {
            const funcName = right.id?.name || (left.property?.name !== "exports" ? left.property?.name : "module.exports");
            nodes.push({
              name: funcName,
              type: "function",
              line: nodePath.node.loc?.start.line || 1,
            });
            currentScope = funcName;
          }
        },
        ExportDefaultDeclaration(nodePath: any) {
          const decl = nodePath.node.declaration;
          if (decl.type === "FunctionDeclaration" || decl.type === "ArrowFunctionExpression" || decl.type === "FunctionExpression") {
            const name = decl.id?.name || "defaultExport";
            nodes.push({
              name,
              type: "function",
              line: nodePath.node.loc?.start.line || 1,
            });
            currentScope = name;
          }
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

  // Java AST Parsing (Classes, Methods, Member functions)
  if (ext === ".java") {
    try {
      const code = fs.readFileSync(filePath, "utf-8");
      const nodes: ASTNode[] = [];
      const links: ASTLink[] = [];
      const lines = code.split("\n");

      let currentClass = "";

      lines.forEach((lineText, idx) => {
        const lineNum = idx + 1;
        const trimmed = lineText.trim();

        // Match Class declaration
        const classMatch = trimmed.match(/(?:public|protected|private)?\s*(?:static\s+)?class\s+(\w+)/);
        if (classMatch) {
          currentClass = classMatch[1];
          nodes.push({
            name: currentClass,
            type: "class",
            line: lineNum,
          });
        }

        // Match Method declaration: e.g. public static int divide(int a, int b)
        const methodMatch = trimmed.match(
          /(?:public|protected|private)\s+(?:static\s+)?(?:[\w<>\[\]]+)\s+(\w+)\s*\(([^)]*)\)/
        );
        if (methodMatch && methodMatch[1] !== "if" && methodMatch[1] !== "while" && methodMatch[1] !== "for") {
          const methodName = `${methodMatch[1]}()`;
          nodes.push({
            name: methodName,
            type: "function",
            line: lineNum,
          });

          if (currentClass) {
            links.push({
              caller: currentClass,
              callee: methodName,
              line: lineNum,
            });
          }
        }
      });

      return { nodes, links };
    } catch (err: any) {
      return { nodes: [], links: [], error: `Java AST Parser error: ${err.message}` };
    }
  }

  return { nodes: [], links: [], error: `Unsupported file extension for AST parsing: ${ext}` };
}
