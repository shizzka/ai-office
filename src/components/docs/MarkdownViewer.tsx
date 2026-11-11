"use client";

import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Comment {
  id: string;
  file_path: string;
  file_base: string;
  line_start: number | null;
  line_end: number | null;
  paragraph_hash: string | null;
  author_type: string;
  author_id: string;
  body: string;
  resolved: number;
  parent_id: string | null;
  created_at: string;
}

interface Props {
  basePath: string;
  filePath: string;
}

export function MarkdownViewer({ basePath, filePath }: Props) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activeBlock, setActiveBlock] = useState<number | null>(null);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchContent = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/files/content?base=${encodeURIComponent(basePath)}&path=${encodeURIComponent(filePath)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((data) => setContent(data.content || ""))
      .catch((e) => setError(`Ошибка загрузки: ${e.message}`))
      .finally(() => setLoading(false));
  }, [basePath, filePath]);

  const fetchComments = useCallback(() => {
    const token = localStorage.getItem("ai-office-token");
    fetch(`/api/files/comments?base=${encodeURIComponent(basePath)}&path=${encodeURIComponent(filePath)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => setComments(data.comments || []))
      .catch(() => {});
  }, [basePath, filePath]);

  useEffect(() => {
    fetchContent();
    fetchComments();
    setActiveBlock(null);
  }, [fetchContent, fetchComments]);

  async function handleSubmitComment() {
    if (!newComment.trim() || activeBlock === null) return;
    setSubmitting(true);
    const token = localStorage.getItem("ai-office-token");
    try {
      await fetch("/api/files/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          base: basePath,
          path: filePath,
          lineStart: activeBlock,
          authorType: "user",
          authorId: "admin",
          text: newComment.trim(),
        }),
      });
      setNewComment("");
      fetchComments();
    } catch { /* skip */ }
    setSubmitting(false);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full text-[#555] text-sm">Загрузка...</div>;
  }

  if (error) {
    return <div className="flex items-center justify-center h-full text-red-400 text-sm">{error}</div>;
  }

  // Split content into blocks for comment anchoring
  const blocks = content.split("\n\n");
  const blockComments = (blockIdx: number) =>
    comments.filter((c) => c.line_start === blockIdx);

  return (
    <div className="h-full overflow-y-auto">
      {/* File header */}
      <div className="sticky top-0 bg-[#0f0f0f]/95 backdrop-blur border-b border-[#2a2a2a] px-6 py-2 z-10">
        <div className="flex items-center gap-2 text-xs text-[#9ba1b5]">
          <span>📄</span>
          <span
            className="text-[#ecb00a] cursor-pointer hover:underline"
            title="Копировать путь"
            onClick={() => {
              navigator.clipboard.writeText(`${basePath}/${filePath}`);
            }}
          >{basePath}/{filePath}</span>
          <span className="text-[#555]">·</span>
          <span className="text-[#555]">{(content.length / 1024).toFixed(1)}KB</span>
          {comments.length > 0 && (
            <>
              <span className="text-[#555]">·</span>
              <span className="text-[#ecb00a]">💬 {comments.length}</span>
            </>
          )}
        </div>
      </div>

      {/* Markdown content — block by block */}
      <div className="px-8 py-6">
        {blocks.map((block, idx) => {
          const bc = blockComments(idx);
          const isActive = activeBlock === idx;

          return (
            <div key={idx} className="group relative">
              {/* Comment indicator */}
              {bc.length > 0 && (
                <div className="absolute -left-6 top-1">
                  <button
                    onClick={() => setActiveBlock(isActive ? null : idx)}
                    className="text-[#ecb00a] text-xs hover:scale-110 transition-transform"
                    title={`${bc.length} комментари${bc.length === 1 ? "й" : bc.length < 5 ? "я" : "ев"}`}
                  >
                    💬 {bc.length}
                  </button>
                </div>
              )}

              {/* Add comment button on hover */}
              {bc.length === 0 && (
                <button
                  onClick={() => setActiveBlock(isActive ? null : idx)}
                  className="absolute -left-6 top-1 text-[#555] text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:text-[#ecb00a]"
                >
                  💬+
                </button>
              )}

              {/* The markdown block */}
              <div
                className={`prose prose-invert prose-sm max-w-none cursor-pointer rounded px-2 -mx-2 transition-colors
                  prose-headings:text-[#e4e6f0] prose-headings:font-bold
                  prose-h1:text-2xl prose-h1:border-b prose-h1:border-[#2a2a2a] prose-h1:pb-2 prose-h1:mb-4
                  prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3
                  prose-h3:text-lg prose-h3:mt-6
                  prose-p:text-[#c8cad0] prose-p:leading-relaxed
                  prose-a:text-[#ecb00a] prose-a:no-underline hover:prose-a:underline
                  prose-strong:text-[#e4e6f0]
                  prose-code:text-[#ecb00a] prose-code:bg-[#252836] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                  prose-pre:bg-[#16161f] prose-pre:border prose-pre:border-[#2a2a2a] prose-pre:rounded-lg
                  prose-li:text-[#c8cad0]
                  prose-table:text-[#c8cad0]
                  prose-th:text-[#e4e6f0] prose-th:bg-[#252836] prose-th:px-3 prose-th:py-2
                  prose-td:px-3 prose-td:py-2 prose-td:border-[#2a2a2a]
                  prose-hr:border-[#2a2a2a]
                  prose-blockquote:border-[#ecb00a] prose-blockquote:text-[#9ba1b5]
                  ${isActive ? "bg-[#ecb00a]/5 ring-1 ring-[#ecb00a]/20" : "hover:bg-[#ffffff]/[0.02]"}
                `}
                onClick={() => setActiveBlock(isActive ? null : idx)}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{block}</ReactMarkdown>
              </div>

              {/* Comment thread */}
              {isActive && (
                <div className="ml-4 mt-2 mb-4 border-l-2 border-[#ecb00a]/30 pl-4 space-y-2">
                  {bc.map((c) => (
                    <div key={c.id} className="bg-[#252836] rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-[#ecb00a]">
                          {c.author_type === "agent" ? `🤖 ${c.author_id}` : `👤 ${c.author_id}`}
                        </span>
                        <span className="text-[10px] text-[#555]">
                          {new Date(c.created_at).toLocaleString("ru-RU")}
                        </span>
                      </div>
                      <div className="text-xs text-[#c8cad0]">{c.body}</div>
                    </div>
                  ))}

                  {/* New comment input */}
                  <div className="flex gap-2">
                    <input
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmitComment()}
                      placeholder="Комментарий... (@Пушкин проверь)"
                      className="flex-1 px-3 py-1.5 bg-[#16161f] border border-[#363a4a] rounded text-xs text-[#e4e6f0] focus:outline-none focus:border-[#ecb00a]/50 placeholder:text-[#555]"
                      autoFocus
                    />
                    <button
                      onClick={handleSubmitComment}
                      disabled={submitting || !newComment.trim()}
                      className="px-3 py-1.5 bg-[#ecb00a] text-[#0a0a12] rounded text-xs font-semibold hover:bg-[#d4a00a] disabled:opacity-50"
                    >
                      {submitting ? "..." : "💬"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
