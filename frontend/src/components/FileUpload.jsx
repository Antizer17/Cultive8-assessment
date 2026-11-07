import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle2, ArrowRight, Play, AlertCircle } from 'lucide-react';

export default function FileUpload({ onUploadFile, onQuickLoad, isUploading }) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const validateAndSetFile = (file) => {
    setError(null);
    if (!file) return;

    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (ext !== '.log' && ext !== '.txt') {
      setError('Invalid file format. Please upload a .log or .txt server log file.');
      return;
    }

    setSelectedFile(file);

    // Fast client-side line & token estimation
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).length;
      const chars = text.length;
      const estimatedTokens = Math.round(chars / 3.2);
      const estimatedChunks = Math.ceil(estimatedTokens / 950);

      setFilePreview({
        lines,
        chars,
        estimatedTokens,
        estimatedChunks,
        sizeMb: (file.size / (1024 * 1024)).toFixed(2)
      });
    };
    reader.readAsText(file.slice(0, 500000));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleManualUpload = () => {
    if (selectedFile) {
      onUploadFile(selectedFile);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1-Click Target Dataset Quick-Loader */}
      <div className="rounded-2xl border border-[#2a374d] bg-gradient-to-r from-[#111622] via-[#141a26] to-[#1a1820] p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-44 h-44 bg-[#38bdf8]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-[#d4b996]/15 text-[#e5d7c3] border border-[#d4b996]/30">
                Official Challenge Target Log
              </span>
              <span className="text-xs text-[#9e9282]">Pre-Configured Dataset</span>
            </div>
            <h3 className="text-lg font-bold text-[#f5efe6] flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#38bdf8]" />
              Cultive8_Workspace_Agrigen_Server.log
            </h3>
            <p className="text-xs text-[#d8cdbe]">
              <span className="font-semibold text-[#f5efe6]">258 lines</span> •{' '}
              <span className="font-semibold text-[#38bdf8]">~31,667 tokens</span> •{' '}
              <span className="font-semibold text-[#d4b996]">9 semantic chunks</span> • Multi-stage brute force, account compromise & injection hunting.
            </p>
          </div>

          <button
            onClick={onQuickLoad}
            disabled={isUploading}
            className="flex items-center gap-2.5 px-6 py-3 rounded-xl bg-gradient-to-r from-[#d4b996] via-[#38bdf8] to-[#60a5fa] hover:opacity-95 text-[#0a0c10] font-bold text-sm shadow-lg shadow-sky-950/50 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            <Play className="h-4 w-4 fill-[#0a0c10]" />
            <span>Analyze Cultive8 Log Now</span>
          </button>
        </div>
      </div>

      {/* Drag & Drop Upload Zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-all cursor-pointer ${
          dragActive
            ? 'border-[#38bdf8] bg-[#162030]/80'
            : 'border-[#273245] bg-[#11151e]/60 hover:border-[#38bdf8]/60 hover:bg-[#141b27]'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".log,.txt"
          onChange={(e) => validateAndSetFile(e.target.files?.[0])}
          className="hidden"
        />

        <div className="max-w-md mx-auto space-y-4">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-[#161c28] border border-[#2b374c] flex items-center justify-center text-[#38bdf8] shadow-inner">
            <UploadCloud className="h-8 w-8" />
          </div>

          <div>
            <h4 className="text-base font-semibold text-[#f5efe6]">
              Upload Custom Server Log File
            </h4>
            <p className="text-xs text-[#9e9282] mt-1">
              Drag & drop your <span className="font-mono text-[#d4b996]">.log</span> or <span className="font-mono text-[#d4b996]">.txt</span> file here, or click to browse.
            </p>
            <p className="text-[11px] text-[#9e9282]/80 mt-1">
              Supports arbitrary file lengths. Automatically split into boundary-safe 950-token chunks.
            </p>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl border border-rose-800/40 bg-rose-950/30 text-rose-300 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* File Preview Card & Analyze Action */}
      {selectedFile && filePreview && (
        <div className="rounded-2xl border border-[#202737] bg-[#11151e] p-5 space-y-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#0c1829] border border-[#1b3a5e] text-[#38bdf8]">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#f5efe6]">{selectedFile.name}</h4>
                <p className="text-xs text-[#9e9282]">
                  {filePreview.sizeMb} MB • {filePreview.lines.toLocaleString()} lines
                </p>
              </div>
            </div>

            <button
              onClick={handleManualUpload}
              disabled={isUploading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#d4b996] to-[#38bdf8] hover:opacity-95 text-[#0a0c10] font-bold text-xs shadow-md shadow-sky-950/40 transition-all hover:scale-[1.02] cursor-pointer disabled:opacity-50"
            >
              <span>Start Chunked Inspection</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#202737] text-xs font-mono">
            <div className="rounded-lg bg-[#0c0f16]/60 p-2 text-center border border-[#1f2735]">
              <span className="text-[#9e9282] block text-[10px]">Total Lines</span>
              <span className="font-semibold text-[#f5efe6]">{filePreview.lines.toLocaleString()}</span>
            </div>
            <div className="rounded-lg bg-[#0c0f16]/60 p-2 text-center border border-[#1f2735]">
              <span className="text-[#9e9282] block text-[10px]">Est. Tokens</span>
              <span className="font-semibold text-[#38bdf8]">~{filePreview.estimatedTokens.toLocaleString()}</span>
            </div>
            <div className="rounded-lg bg-[#0c0f16]/60 p-2 text-center border border-[#1f2735]">
              <span className="text-[#9e9282] block text-[10px]">Est. Chunks</span>
              <span className="font-semibold text-[#d4b996]">{filePreview.estimatedChunks}</span>
            </div>
            <div className="rounded-lg bg-[#0c0f16]/60 p-2 text-center border border-[#1f2735]">
              <span className="text-[#9e9282] block text-[10px]">Context Limit</span>
              <span className="font-semibold text-[#f5efe6]">2,048 tokens</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
