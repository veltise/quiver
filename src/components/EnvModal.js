'use client';

import { useState } from 'react';
import EnvEditor from './EnvEditor';

export default function EnvModal({ envSets, activeEnvId, onClose, onSwitchEnv, onAddEnv, onDeleteEnv, onChangeVars, onRenameEnv }) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const activeVars = envSets.find((s) => s.id === activeEnvId)?.vars ?? [];

  function startRename(s) {
    setRenamingId(s.id);
    setRenameValue(s.name);
  }

  function commitRename() {
    if (renameValue.trim() && renamingId) onRenameEnv(renamingId, renameValue.trim());
    setRenamingId(null);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-20 pt-24" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold">Environments</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">×</button>
        </div>
        <div className="flex gap-1 flex-wrap mb-4">
          {envSets.map((s) => {
            const isActive = s.id === activeEnvId;
            return (
              <div
                key={s.id}
                className={`flex items-center gap-1 px-3 py-1 rounded text-xs transition-colors ${isActive ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}
              >
                {renamingId === s.id ? (
                  <input
                    autoFocus
                    className="bg-transparent outline-none w-24 text-xs"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') { setRenamingId(null); e.stopPropagation(); }
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <button
                    onClick={() => isActive ? startRename(s) : onSwitchEnv(s.id)}
                    title={isActive ? 'Click to rename' : undefined}
                  >
                    {s.name}
                  </button>
                )}
                {envSets.length > 1 && (
                  <button onClick={() => onDeleteEnv(s.id)} className="opacity-60 hover:opacity-100 ml-1">×</button>
                )}
              </div>
            );
          })}
          <button onClick={onAddEnv} className="px-3 py-1 text-xs text-gray-500 hover:text-gray-200 transition-colors">+ Add</button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Use <code className="bg-gray-800 px-1 rounded text-gray-300">{'{{variable}}'}</code> in your URL, headers, or body.
          {activeEnvId && <span className="ml-2 text-gray-600">Click the active tab name to rename it.</span>}
        </p>
        {activeEnvId && (
          <EnvEditor vars={activeVars} onChange={(vars) => onChangeVars(activeEnvId, vars)} />
        )}
      </div>
    </div>
  );
}
