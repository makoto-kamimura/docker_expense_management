import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { apiBaseUrl, apiFetch } from '@/api';
import type { Member } from '@/types';

// SSO (共通の認証サーバー) でのログイン / 連携。アプリ内のブラウザで API の開始 URL を開き、
// 認証サーバーでログインしたあと、ディープリンクで戻ってくる。
// 戻り URL の結果コードは、ここで作った code_verifier (PKCE) がないと交換できない。

export type SsoMode = 'login' | 'link';

export type SsoResult =
  | { mode: 'login'; token: string; user: Member }
  | { mode: 'link'; email: string | null };

export class SsoAuthError extends Error {
  constructor(readonly reason: string) {
    super(ssoErrorMessage(reason));
  }
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function base64url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = i + 1 >= bytes.length ? 2 : i + 2 >= bytes.length ? 3 : 4;
    for (let j = 0; j < chars; j++) out += BASE64URL[(n >> (18 - 6 * j)) & 63];
  }
  return out;
}

async function challengeOf(verifier: string): Promise<string> {
  const b64 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function query(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/** 認証サーバーの画面を開く。利用者が閉じたときは null */
export async function signInWithSso(mode: SsoMode): Promise<SsoResult | null> {
  const verifier = base64url(Crypto.getRandomBytes(32));
  // Expo Go では exp://…/--/auth/sso、ビルド版では expense://auth/sso
  const redirectUri = Linking.createURL('auth/sso');
  const params: Record<string, string> = {
    mode,
    client: 'mobile',
    code_challenge: await challengeOf(verifier),
    redirect_uri: redirectUri,
  };
  if (mode === 'link') {
    // 連携はログイン中の本人だけ。ブラウザには Bearer を渡せないので、先に intent を取る
    const { intent } = await apiFetch<{ intent: string }>('/me/identities/sso/intent', {
      method: 'POST',
      body: '{}',
    });
    params.intent = intent;
  }

  const result = await WebBrowser.openAuthSessionAsync(`${apiBaseUrl()}/auth/sso/start?${query(params)}`, redirectUri);
  if (result.type !== 'success') return null;
  const { queryParams } = Linking.parse(result.url);
  const error = queryParams?.error;
  if (error) throw new SsoAuthError(String(error));
  const code = queryParams?.code;
  if (!code) throw new SsoAuthError('failed');

  try {
    return await apiFetch<SsoResult>('/auth/sso/exchange', {
      method: 'POST',
      body: JSON.stringify({ code: String(code), code_verifier: verifier }),
    });
  } catch (e) {
    // 409 (連携済み) と 400 (デモ用アカウント) は API の文をそのまま出す
    throw e instanceof Error ? e : new SsoAuthError('failed');
  }
}

export function ssoErrorMessage(reason: string): string {
  switch (reason) {
    case 'not_linked':
      return 'この SSO のアカウントは連携されていません。メールアドレスとパスワードでログインし、アカウントの画面で連携してください。';
    case 'mfa_required':
      return 'このアプリは 2 段階認証が必須です。SSO にパスキーでログインしてから、もう一度お試しください。';
    case 'cancelled':
      return 'SSO での操作を中止しました。';
    case 'expired':
      return '有効期限が切れました。もう一度やり直してください。';
    default:
      return 'SSO でログインできませんでした。もう一度お試しください。';
  }
}

/** API で SSO が有効なら、その表示名 (無効なら null。ボタンを出さない) */
export async function ssoName(): Promise<string | null> {
  try {
    const res = await apiFetch<{ sso: boolean; sso_name: string | null }>('/auth/providers');
    return res.sso ? res.sso_name || 'SSO' : null;
  } catch {
    return null;
  }
}
