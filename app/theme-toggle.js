'use client';

import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    const saved = window.localStorage.getItem('signalIntelTheme') || 'light';
    setTheme(saved);
    document.documentElement.dataset.theme = saved;
  }, []);

  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    window.localStorage.setItem('signalIntelTheme', next);
    document.documentElement.dataset.theme = next;
  };

  return (
    <button
      type="button"
      onClick={toggle}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-strong)',
        borderRadius: 6,
        color: 'var(--text-muted)',
        cursor: 'pointer',
        fontSize: 11,
        padding: '8px 10px',
        whiteSpace: 'nowrap',
      }}
    >
      {theme === 'light' ? 'Dark Theme' : 'Light Theme'}
    </button>
  );
}
