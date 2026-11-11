"use client";

import { useState } from "react";
import { FileExplorer } from "./FileExplorer";
import { MarkdownViewer } from "./MarkdownViewer";

export function DocsPanel() {
  const [selectedFile, setSelectedFile] = useState<{ base: string; path: string } | null>(null);

  return (
    <div className="flex h-full">
      {/* File tree sidebar */}
      <div className="w-64 border-r border-[#2a2a2a] bg-[#0f0f0f]/50 flex flex-col shrink-0">
        <div className="px-4 py-2.5 border-b border-[#2a2a2a]">
          <h3 className="text-xs font-semibold tracking-widest text-[#555] uppercase">
            Документы
          </h3>
        </div>
        <FileExplorer
          onSelectFile={(base, path) => setSelectedFile({ base, path })}
          selectedPath={selectedFile ? `${selectedFile.base}/${selectedFile.path}` : null}
        />
      </div>

      {/* Content area */}
      <div className="flex-1 bg-[#0a0a12]">
        {selectedFile ? (
          <MarkdownViewer basePath={selectedFile.base} filePath={selectedFile.path} />
        ) : (
          <div className="flex items-center justify-center h-full text-[#555] text-sm">
            <div className="text-center">
              <div className="text-4xl mb-3">📄</div>
              <div>Выбери файл слева</div>
              <div className="text-xs mt-1 text-[#444]">
                SecondBrain · Проекты · Память агентов
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
