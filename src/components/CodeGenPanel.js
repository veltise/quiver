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
  [/\/\/[^\n]*/, 'text-muted'],
  [/"(?:[^"\\]|\\.)*"/, 'text-info'],
  [/'(?:[^'\\]|\\.)*'/, 'text-info'],
  [/`(?:[^`\\]|\\.)*`/, 'text-info'],
  [/\b(?:const|let|var|await|async|return|new|true|false|null|undefined)\b/, 'text-accent'],
  [/\b(?:fetch|axios|console|response|data|JSON)\b/, 'text-success'],
  [/\.\w+(?=\s*\()/, 'text-accent'],
  [/[{}[\](),;:]/, 'text-muted'],
  [/\d+/, 'text-text'],
];

const LANG_RULES = {
  cURL: [
    [/'[^']*'/, 'text-info'],
    [/\bcurl\b/, 'text-accent'],
    [/--?[\w-]+/, 'text-warning'],
    [/\b(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/, 'text-accent'],
    [/\\$/, 'text-dim'],
  ],
  Fetch:  JS_RULES,
  Axios:  JS_RULES,
  Python: [
    [/#[^\n]*/, 'text-muted'],
    [/"(?:[^"\\]|\\.)*"/, 'text-info'],
    [/'(?:[^'\\]|\\.)*'/, 'text-info'],
    [/\b(?:import|from|None|True|False|return|def|class|if|elif|else|and|or|not|in|is)\b/, 'text-accent'],
    [/\b(?:print|requests|headers|payload|response|data)\b/, 'text-success'],
    [/\.\w+(?=\s*\()/, 'text-accent'],
    [/[{}[\](),=:]/, 'text-muted'],
    [/\d+/, 'text-text'],
  ],
};

export default function CodeGenPanel({ req }) {
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {LANGUAGES.map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-3 py-1 text-xs rounded transition-colors ${lang === l ? 'bg-[rgba(242,237,228,.08)] text-text' : 'text-muted hover:text-text hover:bg-surface-raised'}`}
            >
              {l}
            </button>
          ))}
        </div>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-text transition-colors px-2 py-1 rounded border border-border hover:border-border-strong"
        >
          <Copy size={11} />{copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        className="text-sm font-mono overflow-auto max-h-72 whitespace-pre leading-relaxed bg-surface-raised rounded p-4"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  );
}
