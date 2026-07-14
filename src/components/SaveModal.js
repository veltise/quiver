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
      <h2 className="text-sm font-bold mb-4">{title}</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          autoFocus
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500"
          placeholder="e.g. GitHub get user"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} className="px-4 py-1.5 text-sm text-gray-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
          >
            Save
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
