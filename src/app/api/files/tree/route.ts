import { NextResponse } from "next/server";
import { readdirSync, statSync, existsSync, readFileSync } from "fs";
import { join, basename } from "path";

// Load file roots from config or env
function getFileRoots(): Array<{path: string; label: string}> {
  try {
    const configPath = join(process.cwd(), "config", "office.json");
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      if (config.fileRoots) return config.fileRoots;
    }
  } catch {}
  
  // Default: show agent workspaces from OpenClaw
  const home = process.env.HOME || "/root";
  const clawBase = join(home, ".openclaw", "agents");
  const roots: Array<{path: string; label: string}> = [];
  
  try {
    for (const dir of readdirSync(clawBase)) {
      const agentPath = join(clawBase, dir);
      if (statSync(agentPath).isDirectory()) {
        roots.push({ path: agentPath, label: `📁 ${dir}` });
      }
    }
  } catch {}
  
  return roots;
}

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: TreeNode[];
}

function buildTree(dirPath: string, depth = 0, maxDepth = 3): TreeNode | null {
  if (depth > maxDepth || !existsSync(dirPath)) return null;
  
  const name = basename(dirPath);
  if (name.startsWith(".") || name === "node_modules") return null;
  
  const stat = statSync(dirPath);
  if (stat.isFile()) {
    return { name, path: dirPath, type: "file" };
  }
  
  const children: TreeNode[] = [];
  try {
    for (const entry of readdirSync(dirPath)) {
      const child = buildTree(join(dirPath, entry), depth + 1, maxDepth);
      if (child) children.push(child);
    }
  } catch {}
  
  return { name, path: dirPath, type: "directory", children };
}

export async function GET() {
  const roots = getFileRoots();
  const trees = roots.map(r => ({
    label: r.label,
    tree: buildTree(r.path),
  })).filter(t => t.tree);
  
  return NextResponse.json({ roots: trees });
}
