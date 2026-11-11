"use client";

import { useState, useEffect } from "react";

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: TreeNode[];
}

interface FileRoot {
  label: string;
  basePath: string;
  tree: TreeNode[];
}

interface Props {
  onSelectFile: (basePath: string, filePath: string) => void;
  selectedPath: string | null;
}

function TreeItem({
  node,
  basePath,
  depth,
  onSelect,
  selectedPath,
}: {
  node: TreeNode;
  basePath: string;
  depth: number;
  onSelect: (base: string, path: string) => void;
  selectedPath: string | null;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isSelected = selectedPath === `${basePath}/${node.path}`;

  if (node.type === "directory") {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 w-full text-left px-2 py-0.5 hover:bg-[#252836] rounded text-xs text-[#9ba1b5] transition-colors"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <span className="text-[10px] w-3">{expanded ? "▾" : "▸"}</span>
          <span>📁</span>
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                basePath={basePath}
                depth={depth + 1}
                onSelect={onSelect}
                selectedPath={selectedPath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(basePath, node.path)}
      className={`flex items-center gap-1 w-full text-left px-2 py-0.5 rounded text-xs transition-colors truncate ${
        isSelected
          ? "bg-[#ecb00a]/10 text-[#ecb00a]"
          : "text-[#c8cad0] hover:bg-[#252836]"
      }`}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <span>📄</span>
      <span className="truncate">{node.name}</span>
    </button>
  );
}

interface SearchResult {
  basePath: string;
  filePath: string;
  fileName: string;
  matches: { line: number; text: string }[];
}

export function FileExplorer({ onSelectFile, selectedPath }: Props) {
  const [roots, setRoots] = useState<FileRoot[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRoots, setExpandedRoots] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchTimeout, setSearchTimeoutId] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch("/api/files/tree")
      .then((r) => r.json())
      .then((data) => {
        setRoots(data.roots || []);
        // Expand first root by default
        if (data.roots?.length) {
          setExpandedRoots(new Set([data.roots[0].basePath]));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleRoot = (basePath: string) => {
    setExpandedRoots((prev) => {
      const next = new Set(prev);
      if (next.has(basePath)) next.delete(basePath);
      else next.add(basePath);
      return next;
    });
  };

  function handleSearch(q: string) {
    setSearchQuery(q);
    if (searchTimeout) clearTimeout(searchTimeout);
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    const tid = setTimeout(() => {
      setSearching(true);
      const token = localStorage.getItem("ai-office-token");
      fetch(`/api/files/search?q=${encodeURIComponent(q)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((r) => r.json())
        .then((data) => setSearchResults(data.results || []))
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 300);
    setSearchTimeoutId(tid);
  }

  if (loading) {
    return <div className="p-3 text-xs text-[#555]">Загрузка...</div>;
  }

  return (
    <div className="overflow-y-auto h-full flex flex-col">
      {/* Search */}
      <div className="px-2 py-2 border-b border-[#2a2a2a]">
        <div className="relative">
          <input
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="🔍 Поиск по файлам..."
            className="w-full px-3 py-1.5 bg-[#16161f] border border-[#363a4a] rounded text-xs text-[#e4e6f0] focus:outline-none focus:border-[#ecb00a]/50 placeholder:text-[#555]"
          />
          {searching && (
            <span className="absolute right-2 top-1.5 text-[10px] text-[#555]">⏳</span>
          )}
        </div>
      </div>

      {/* Search results */}
      {searchQuery.length >= 2 ? (
        <div className="flex-1 overflow-y-auto py-1">
          {searchResults.length === 0 && !searching && (
            <div className="text-center text-xs text-[#555] py-4">Ничего не найдено</div>
          )}
          {searchResults.map((r, i) => (
            <button
              key={`${r.basePath}-${r.filePath}-${i}`}
              onClick={() => {
                onSelectFile(r.basePath, r.filePath);
                setSearchQuery("");
                setSearchResults([]);
              }}
              className="w-full text-left px-3 py-2 hover:bg-[#252836] transition-colors border-b border-[#1a1a2e]"
            >
              <div className="text-xs text-[#ecb00a] truncate">{r.fileName}</div>
              <div className="text-[10px] text-[#555] truncate">{r.filePath}</div>
              {r.matches.slice(0, 2).map((m, j) => (
                <div key={j} className="text-[10px] text-[#9ba1b5] truncate mt-0.5">
                  {m.line > 0 && <span className="text-[#555]">L{m.line}: </span>}
                  {m.text}
                </div>
              ))}
            </button>
          ))}
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto py-1">
      {roots.map((root) => (
        <div key={root.basePath} className="mb-1">
          <button
            onClick={() => toggleRoot(root.basePath)}
            className="flex items-center gap-1 w-full text-left px-3 py-1.5 hover:bg-[#252836] text-xs font-semibold text-[#9ba1b5] transition-colors"
          >
            <span className="text-[10px] w-3">
              {expandedRoots.has(root.basePath) ? "▾" : "▸"}
            </span>
            <span>{root.label}</span>
            <span className="text-[10px] text-[#555] ml-auto">{root.tree.length}</span>
          </button>
          {expandedRoots.has(root.basePath) && (
            <div>
              {root.tree.map((node) => (
                <TreeItem
                  key={node.path}
                  node={node}
                  basePath={root.basePath}
                  depth={1}
                  onSelect={onSelectFile}
                  selectedPath={selectedPath}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
      )}
    </div>
  );
}
