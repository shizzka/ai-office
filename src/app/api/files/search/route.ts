import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

function getSearchRoots(): string[] {
  try {
    const configPath = join(process.cwd(), "config", "office.json");
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      if (config.fileRoots) return config.fileRoots.map((r: {path: string}) => r.path);
    }
  } catch {}
  return [];
}

function searchFiles(dir: string, query: string, results: Array<{path: string; match: string}>, depth = 0) {
  if (depth > 4 || results.length > 20) return;
  try {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith(".") || entry === "node_modules") continue;
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        searchFiles(full, query, results, depth + 1);
      } else if ([".md", ".txt", ".json", ".ts", ".js"].includes(extname(entry))) {
        if (entry.toLowerCase().includes(query.toLowerCase())) {
          results.push({ path: full, match: entry });
        }
      }
    }
  } catch {}
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }
  
  const roots = getSearchRoots();
  const results: Array<{path: string; match: string}> = [];
  for (const root of roots) searchFiles(root, query, results);
  
  return NextResponse.json({ results: results.slice(0, 20) });
}
