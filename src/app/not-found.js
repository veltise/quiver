'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-canvas text-text flex flex-col items-center justify-center gap-6 p-4">
      <span className="text-body font-semibold tracking-wide text-brand">Quiver</span>
      <div className="text-center">
        <p className="font-mono text-dim text-6xl font-bold mb-4">404</p>
        <p className="text-muted text-body">This page doesn&apos;t exist.</p>
        <p className="text-dim text-body mt-1">The request or shared link may have expired.</p>
      </div>
      <Link
        href="/"
        className="text-body px-4 py-2 rounded border border-border text-muted hover:text-text hover:border-border-strong transition-colors"
      >
        Back to playground
      </Link>
    </div>
  );
}
