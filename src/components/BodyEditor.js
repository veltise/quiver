'use client';

import FormEditor from './FormEditor';

const TYPES = ['none', 'json', 'raw', 'form', 'graphql'];

function jsonError(str) {
  if (!str?.trim()) return null;
  try { JSON.parse(str); return null; }
  catch (e) { return e.message; }
}

export default function BodyEditor({ bodyType, body, formFields, graphqlQuery, graphqlVariables, onChange }) {
  const bodyError = bodyType === 'json' ? jsonError(body) : null;
  const varsError = bodyType === 'graphql' ? jsonError(graphqlVariables) : null;

  function emit(patch) {
    onChange({ bodyType, body, formFields, graphqlQuery: graphqlQuery ?? '', graphqlVariables: graphqlVariables ?? '{}', ...patch });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1">
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => emit({ bodyType: t })}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              bodyType === t
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            {t === 'form' ? 'form-data' : t === 'graphql' ? 'GraphQL' : t}
          </button>
        ))}
      </div>

      {bodyType === 'form' && (
        <FormEditor
          fields={formFields ?? []}
          onChange={(fields) => emit({ formFields: fields })}
        />
      )}

      {bodyType !== 'none' && bodyType !== 'form' && bodyType !== 'graphql' && (
        <div className="flex flex-col gap-1">
          {bodyType === 'json' && (
            <div className="flex justify-end">
              <button
                onClick={() => { try { emit({ body: JSON.stringify(JSON.parse(body), null, 2) }); } catch {} }}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Format
              </button>
            </div>
          )}
          <textarea
            className={`w-full h-36 bg-gray-800 border rounded p-3 text-sm placeholder-gray-600 focus:outline-none resize-none font-mono ${
              bodyError ? 'border-red-500 focus:border-red-400' : 'border-gray-700 focus:border-gray-500'
            }`}
            placeholder={bodyType === 'json' ? '{"key": "value"}' : 'Request body'}
            value={body}
            onChange={(e) => emit({ body: e.target.value })}
          />
          {bodyError && <p className="text-red-400 text-xs">{bodyError}</p>}
        </div>
      )}

      {bodyType === 'graphql' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Query</span>
            <textarea
              className="w-full h-40 bg-gray-800 border border-gray-700 rounded p-3 text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-gray-500 resize-none"
              placeholder={"query {\n  user(id: 1) {\n    name\n    email\n  }\n}"}
              value={graphqlQuery ?? ''}
              onChange={(e) => emit({ graphqlQuery: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Variables</span>
              <button
                onClick={() => { try { emit({ graphqlVariables: JSON.stringify(JSON.parse(graphqlVariables), null, 2) }); } catch {} }}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Format
              </button>
            </div>
            <textarea
              className={`w-full h-24 bg-gray-800 border rounded p-3 text-sm font-mono placeholder-gray-600 focus:outline-none resize-none ${
                varsError ? 'border-red-500 focus:border-red-400' : 'border-gray-700 focus:border-gray-500'
              }`}
              placeholder='{"id": "123"}'
              value={graphqlVariables ?? '{}'}
              onChange={(e) => emit({ graphqlVariables: e.target.value })}
            />
            {varsError && <p className="text-red-400 text-xs">{varsError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
