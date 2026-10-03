'use client';
import { useState } from 'react';
import { THEMES, THEME_COOKIE, type Theme } from '@/lib/theme';

/** 表示 (端末に合わせる / ライト / ダーク) の切り替え。Cookie に覚え、再読み込みせずにすぐ反映する */
export default function ThemeSwitch({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const change = (next: Theme) => {
    setTheme(next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    if (next === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
  };
  return (
    <select
      className="theme-switch"
      aria-label="表示"
      value={theme}
      onChange={(e) => change(e.target.value as Theme)}
    >
      {THEMES.map((t) => (
        <option key={t.key} value={t.key}>{t.label}</option>
      ))}
    </select>
  );
}
