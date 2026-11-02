'use client';

import { useRef, useState } from 'react';
import Icon from './Icon';

/**
 * Copies `text` to the clipboard and confirms it for a moment. If the browser
 * refuses, it selects the text shown next to it so Ctrl+C copies it.
 */
export default function CopyButton({ text, label = 'Copy', className = '' }) {
  const [state, setState] = useState('idle');
  const ref = useRef(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('done');
    } catch {
      const code = ref.current && ref.current.parentElement && ref.current.parentElement.querySelector('code');
      if (code) {
        const range = document.createRange();
        range.selectNodeContents(code);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      setState('failed');
    }
    setTimeout(() => setState('idle'), 2400);
  };
  return (
    <button ref={ref} type="button" className={`copy-btn ${state} ${className}`} onClick={copy} aria-live="polite">
      <Icon name={state === 'done' ? 'check' : 'copy'} size={15} />
      {state === 'done' ? 'Copied' : state === 'failed' ? 'Selected: press Ctrl+C' : label}
    </button>
  );
}
