/** 表示の設定。system は端末 (OS) の設定に合わせる */
export type Theme = 'system' | 'light' | 'dark';

export const THEME_COOKIE = 'theme';

export const THEMES: { key: Theme; label: string }[] = [
  { key: 'system', label: '端末に合わせる' },
  { key: 'light', label: 'ライト' },
  { key: 'dark', label: 'ダーク' },
];

export function parseTheme(v: string | undefined): Theme {
  return v === 'light' || v === 'dark' ? v : 'system';
}
