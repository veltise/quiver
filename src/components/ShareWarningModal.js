'use client';

import { ShieldAlert } from 'lucide-react';

export default function ShareWarningModal({ onConfirm, onCancel, sharing }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onCancel} />
      <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface border border-border rounded-xl shadow-2xl p-6 w-96">
        <h2 className="text-sm font-semibold text-text mb-1">Share this request</h2>
        <p className="text-xs text-muted mb-4">
          Anyone with the link can view it. Links expire after 30 days.
        </p>

        <div className="mb-4 bg-warning/10 border border-warning/25 rounded-lg px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-xs text-warning font-medium mb-1">
            <ShieldAlert size={12} />
            This link is public and unencrypted
          </div>
          <p className="text-xs text-warning/80 leading-relaxed">
            Only the Auth tab and any <code className="text-warning">Authorization</code> header are removed automatically. API keys in custom headers, the URL, or the body will be visible to anyone with the link — remove those yourself first.
          </p>
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="text-sm px-4 py-2 text-muted hover:text-text transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={sharing}
            className="chamfer-sm text-sm px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-colors text-ink"
          >
            {sharing ? 'Sharing…' : 'Copy Share Link'}
          </button>
        </div>
      </div>
    </>
  );
}
