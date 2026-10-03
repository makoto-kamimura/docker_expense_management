import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { applyPalette } from '@/components/ui';

/** 表示の設定。system は端末の設定に合わせる */
export type ThemeMode = 'system' | 'light' | 'dark';

export const THEME_LABEL: Record<ThemeMode, string> = { system: '自動', light: 'ライト', dark: 'ダーク' };
/** 切り替えボタンを押したときの順番 */
export const NEXT_THEME: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' };

const KEY = 'theme';
let mode: ThemeMode = 'system';
let scheme: 'light' | 'dark' = 'light';
let version = 0;
const listeners = new Set<() => void>();

function update() {
  scheme = mode === 'system' ? (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light') : mode;
  applyPalette(scheme);
  version++;
  listeners.forEach((l) => l());
}

/** 起動時に保存した設定を読む (読めなければ「自動」) */
export async function loadTheme() {
  const saved = await SecureStore.getItemAsync(KEY).catch(() => null);
  mode = saved === 'light' || saved === 'dark' ? saved : 'system';
  update();
}

export async function setThemeMode(next: ThemeMode) {
  mode = next;
  update();
  await SecureStore.setItemAsync(KEY, next).catch(() => {});
}

// 「自動」のときは、端末のダークモードの切り替えにも合わせる
Appearance.addChangeListener(() => {
  if (mode === 'system') update();
});

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** テーマが変わったら描き直す。色 (C / s) を使う画面はこれを呼ぶ */
export function useTheme(): { mode: ThemeMode; scheme: 'light' | 'dark' } {
  useSyncExternalStore(subscribe, () => version);
  return { mode, scheme };
}
