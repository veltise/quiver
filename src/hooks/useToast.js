'use client';

import { useState } from 'react';

export function useToast() {
  const [toasts, setToasts] = useState([]);

  function addToast(message, type = 'success') {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }

  return { toasts, addToast };
}
