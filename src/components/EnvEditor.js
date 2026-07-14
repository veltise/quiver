'use client';

import KeyValueEditor from './KeyValueEditor';

export default function EnvEditor({ vars, onChange }) {
  return (
    <KeyValueEditor
      items={vars}
      onChange={onChange}
      keyPlaceholder="variable"
      valuePlaceholder="value"
      addLabel="Add variable"
      keyPrefix="{{"
      keySuffix="}}"
      mono
      showClearAll
    />
  );
}
