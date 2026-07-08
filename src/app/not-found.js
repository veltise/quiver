'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-center gap-6 p-4">
      <span className="text-base font-semibold tracking-wide text-white">Quiver</span>
      <div className="text-center">
        <p className="font-mono text-gray-700 text-6xl font-bold mb-4">404</p>
        <p className="text-gray-400 text-sm">This page doesn&apos;t exist.</p>
        <p className="text-gray-600 text-xs mt-1">The request or shared link may have expired.</p>
      </div>
      <Link
        href="/"
        className="text-xs px-4 py-2 rounded border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
      >
        Back to playground
      </Link>
    </div>
  );
}
