'use client';

import { useState } from 'react';
import { parseCurl } from '@/lib/curl';

export default function CurlImportModal({ onImport, onCancel }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  function handleImport() {
    if (value.length > 100_000) {
      setError('Input too large.');
      return;
    }
    const result = parseCurl(value.trim());
    if (!result || !result.url) {
      setError('Could not parse — make sure it starts with "curl" and includes a URL.');
      return;
    }
    if (!/^https?:\/\//i.test(result.url)) {
      setError('URL must start with http:// or https://');
      return;
    }
    onImport(result);
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-start justify-center z-20 pt-24"
      onClick={onCancel}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-bold mb-3">Import from cURL</h2>
        <textarea
          autoFocus
          className="w-full h-40 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm placeholder-gray-600 focus:outline-none focus:border-gray-500 resize-none font-mono"
          placeholder={"curl 'https://api.example.com/users' \\\n  -H 'Authorization: Bearer token' \\\n  -d '{\"key\": \"value\"}'"}
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(''); }}
        />
        {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
        <div className="flex gap-2 justify-end mt-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!value.trim()}
            className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
