'use client';

import KeyValueEditor from './KeyValueEditor';

export default function FormEditor({ fields, onChange }) {
  return <KeyValueEditor items={fields} onChange={onChange} keyPlaceholder="Key" valuePlaceholder="Value" addLabel="Add field" />;
}
