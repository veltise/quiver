'use client';

import { useState, useMemo } from 'react';
import { Copy } from 'lucide-react';
import { generateCurl, generateFetch, generateAxios, generatePython } from '@/lib/request';

const LANGUAGES = ['cURL', 'Fetch', 'Axios', 'Python'];

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlight(code, rules) {
  const compiled = rules.map(([pattern, cls]) => ({ re: new RegExp(pattern.source, 'y'), cls }));
  let out = '';
  let pos = 0;
  while (pos < code.length) {
    let matched = false;
    for (const { re, cls } of compiled) {
      re.lastIndex = pos;
      const m = re.exec(code);
      if (m) {
        out += `<span class="${cls}">${esc(m[0])}</span>`;
        pos += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) out += esc(code[pos++]);
  }
  return out;
}

const JS_RULES = [
  [/\/\/[^\n]*/, 'text-gray-500'],
  [/"(?:[^"\\]|\\.)*"/, 'text-green-300'],
  [/'(?:[^'\\]|\\.)*'/, 'text-green-300'],
  [/`(?:[^`\\]|\\.)*`/, 'text-green-300'],
  [/\b(?:const|let|var|await|async|return|new|true|false|null|undefined)\b/, 'text-purple-400'],
  [/\b(?:fetch|axios|console|response|data|JSON)\b/, 'text-blue-300'],
  [/\.\w+(?=\s*\()/, 'text-sky-300'],
  [/[{}[\](),;:]/, 'text-gray-500'],
  [/\d+/, 'text-orange-300'],
];

const LANG_RULES = {
  cURL: [
    [/'[^']*'/, 'text-green-300'],
    [/\bcurl\b/, 'text-indigo-400'],
    [/--?[\w-]+/, 'text-yellow-300'],
    [/\b(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/, 'text-sky-300'],
    [/\\$/, 'text-gray-600'],
  ],
  Fetch:  JS_RULES,
  Axios:  JS_RULES,
  Python: [
    [/#[^\n]*/, 'text-gray-500'],
    [/"(?:[^"\\]|\\.)*"/, 'text-green-300'],
    [/'(?:[^'\\]|\\.)*'/, 'text-green-300'],
    [/\b(?:import|from|None|True|False|return|def|class|if|elif|else|and|or|not|in|is)\b/, 'text-purple-400'],
    [/\b(?:print|requests|headers|payload|response|data)\b/, 'text-blue-300'],
    [/\.\w+(?=\s*\()/, 'text-sky-300'],
    [/[{}[\](),=:]/, 'text-gray-500'],
    [/\d+/, 'text-orange-300'],
  ],
};

export default function CodeGenModal({ req, onClose }) {
  const [lang, setLang] = useState('Fetch');
  const [copied, setCopied] = useState(false);

  const code = useMemo(() => {
    switch (lang) {
      case 'cURL':   return generateCurl(req);
      case 'Fetch':  return generateFetch(req);
      case 'Axios':  return generateAxios(req);
      case 'Python': return generatePython(req);
      default:       return '';
    }
  }, [lang, req]);

  const highlighted = useMemo(
    () => highlight(code, LANG_RULES[lang] ?? []),
    [code, lang]
  );

  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold">Code Generation</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none">×</button>
        </div>

        <div className="flex border-b border-gray-800">
          {LANGUAGES.map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-4 py-2.5 text-sm transition-colors ${lang === l ? 'text-white border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="relative">
          <pre
            className="p-5 text-sm font-mono overflow-auto max-h-80 whitespace-pre leading-relaxed bg-gray-950/60"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
          <button
            onClick={copy}
            className="absolute top-3 right-3 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-200 transition-colors px-2 py-1 rounded border border-gray-700 hover:border-gray-500 bg-gray-900"
          >
            <Copy size={11} />{copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
