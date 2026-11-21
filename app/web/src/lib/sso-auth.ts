import { createHash, randomBytes } from 'node:crypto';
import { getApiBase } from './api';

/**
 * SSO の途中で code_verifier (PKCE) を持っておく Cookie。
 * API から戻った結果コードは、この値がないと交換できない (他人に URL を踏ませても成立しない)。
 */
export const PKCE_COOKIE = 'sso_pkce';

export const PKCE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  // 認証サーバーから戻るのは /auth/sso/complete なので、そこでだけ送る
  path: '/auth/sso',
  maxAge: 10 * 60,
} as const;

export type SsoMode = 'login' | 'link';

export function createVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export function challengeOf(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** Cookie の値は「mode.verifier」 */
export function encodePkce(mode: SsoMode, verifier: string): string {
  return `${mode}.${verifier}`;
}

export function decodePkce(value: string | undefined): { mode: SsoMode; verifier: string } | null {
  if (!value) return null;
  const [mode, verifier] = value.split('.', 2);
  if ((mode !== 'login' && mode !== 'link') || !verifier) return null;
  return { mode, verifier };
}

/** API で SSO が有効なら、その表示名 (無効なら null。ボタンを出さない) */
export async function ssoName(): Promise<string | null> {
  try {
    const res = await fetch(`${getApiBase()}/auth/providers`, { cache: 'no-store' });
    if (!res.ok) return null;
    const j = (await res.json()) as { sso?: boolean; sso_name?: string | null };
    return j.sso ? j.sso_name || 'SSO' : null;
  } catch {
    return null;
  }
}

/** API から戻ってきた error を、画面に出す文に変える */
export function ssoErrorMessage(reason: string | undefined, mode: SsoMode, name = 'SSO'): string | null {
  if (!reason) return null;
  switch (reason) {
    case 'not_linked':
      return `この ${name} のアカウントは連携されていません。メールアドレスとパスワードでログインし、設定画面で連携してください。`;
    case 'mfa_required':
      return `このアプリは 2 段階認証が必須です。${name} にパスキーでログインしてから、もう一度お試しください。`;
    case 'cancelled':
      return mode === 'login' ? `${name} でのログインを中止しました。` : `${name} との連携を中止しました。`;
    case 'expired':
      return '有効期限が切れました。もう一度やり直してください。';
    case 'conflict':
      return `この ${name} のアカウントは、ほかの利用者に連携されているか、すでに別のアカウントと連携済みです。`;
    case 'demo':
      return `デモ用のアカウントには ${name} を連携できません。`;
    default:
      return mode === 'login'
        ? `${name} でログインできませんでした。もう一度お試しください。`
        : `${name} と連携できませんでした。もう一度お試しください。`;
  }
}
