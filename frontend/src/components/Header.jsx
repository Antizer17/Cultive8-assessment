import React from 'react';

export default function Header() {
  // Placeholder stub: application navbar, brand, and active model status badge
  return (
    <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <span>🛡️</span> Security Log Analyzer
        </h1>
      </div>
    </header>
  );
}
