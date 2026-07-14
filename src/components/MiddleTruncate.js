'use client';

import { useState, useRef, useLayoutEffect } from 'react';

// Middle-ellipsis truncation: keeps the start and end of the text visible,
// e.g. "jsonplace…code.com". Measures available width with a ResizeObserver
// and re-truncates on resize. Shows the full text in a native tooltip.
export default function MiddleTruncate({ text, className = '' }) {
  const ref = useRef(null);
  const canvasRef = useRef(null);
  const [display, setDisplay] = useState(text);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !text) { setDisplay(text); return; }

    function truncate() {
      const style = getComputedStyle(el);
      canvasRef.current ??= document.createElement('canvas');
      const ctx = canvasRef.current.getContext('2d');
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const avail = el.clientWidth;

      if (avail <= 0 || ctx.measureText(text).width <= avail) {
        setDisplay(text);
        return;
      }

      // Binary search the number of kept characters (split between head and tail)
      let lo = 0, hi = text.length - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const head = Math.ceil(mid / 2), tail = Math.floor(mid / 2);
        const candidate = text.slice(0, head) + '…' + text.slice(text.length - tail);
        if (ctx.measureText(candidate).width <= avail) lo = mid; else hi = mid - 1;
      }
      const head = Math.ceil(lo / 2), tail = Math.floor(lo / 2);
      setDisplay(lo <= 0 ? '…' : text.slice(0, head) + '…' + text.slice(text.length - tail));
    }

    truncate();
    const ro = new ResizeObserver(truncate);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  return (
    <span ref={ref} title={text} className={`block overflow-hidden whitespace-nowrap ${className}`}>
      {display}
    </span>
  );
}
