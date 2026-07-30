'use client';

import { useState } from 'react';
import ModalShell from './ModalShell';

export default function SaveModal({ initialName, onSave, onCancel, title = 'Save request' }) {
  const [name, setName] = useState(initialName ?? '');

  function handleSubmit(e) {
    e.preventDefault();
    if (name.trim()) onSave(name.trim());
  }

  return (
    <ModalShell onClose={onCancel}>
      <h2 className="text-body font-bold mb-4">{title}</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          autoFocus
          className="bg-surface-raised border border-border rounded px-3 py-2 text-body placeholder-dim focus:outline-none focus:border-border-strong"
          placeholder="e.g. GitHub get user"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} className="px-4 py-1.5 text-body text-muted hover:text-text transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="px-4 py-1.5 text-body bg-accent hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
          >
            Save
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
