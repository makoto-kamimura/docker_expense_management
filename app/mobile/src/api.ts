import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Linking } from 'react-native';
import { router } from 'expo-router';

// API のベース URL を解決する。
// 1. 環境変数 EXPO_PUBLIC_API_BASE_URL (Metro 起動時に指定)。公開デモでは API が 8080 番を
//    公開していないので https://expense.makoto-kamimura.com/api を指定する (expo-demo.sh)。
// 2. 開発時(Expo Go)は Metro を配信しているホスト(= Mac)の IP を hostUri から取得し、
//    ポートだけバックエンドの 8080 に差し替える。これでネットワークが変わって IP が
//    変わっても、app.json を書き換えずに自動追従する。
// 3. hostUri が無い場合(本番ビルド等)は app.json の extra.apiUrl、最後に localhost。
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  const hostUri = Constants.expoConfig?.hostUri; // 例: "192.168.100.165:8081"
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:8080`;
  return (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:8080';
}

const API_URL: string = resolveApiUrl();

const TOKEN_KEY = 'expense_token';

export async function setToken(token: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export interface OcrResult {
  amount_jpy: number | null;
  incurred_on: string | null;
  raw_text: string;
}

// レシート画像を /ocr に multipart で送り、推定した金額・日付を受け取る。
// FormData 送信時は Content-Type を自分で設定しない（boundary は fetch が付与）。
export async function ocrReceipt(uri: string): Promise<OcrResult> {
  const token = await getToken();
  const name = uri.split('/').pop() ?? 'receipt.jpg';
  const ext = /\.(\w+)$/.exec(name)?.[1]?.toLowerCase() ?? 'jpg';
  const type = ext === 'png' ? 'image/png' : 'image/jpeg';

  const form = new FormData();
  // React Native の FormData はファイルを { uri, name, type } で受け付ける
  form.append('file', { uri, name, type } as unknown as Blob);

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/ocr`, { method: 'POST', headers, body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status}`);
  }
  return (await res.json()) as OcrResult;
}

/** 画像/PDF を申請に添付する (kind: evidence = 資料, receipt = 購入後のレシート) */
export async function uploadAttachment(
  requestId: string,
  kind: 'evidence' | 'receipt',
  file: { uri: string; name?: string | null; mimeType?: string | null },
): Promise<void> {
  const token = await getToken();
  const name = file.name ?? file.uri.split('/').pop() ?? 'file.jpg';
  const ext = /\.(\w+)$/.exec(name)?.[1]?.toLowerCase() ?? 'jpg';
  const guessed =
    ext === 'png' ? 'image/png'
    : ext === 'webp' ? 'image/webp'
    : ext === 'heic' ? 'image/heic'
    : ext === 'pdf' ? 'application/pdf'
    : 'image/jpeg';
  const form = new FormData();
  form.append('file', { uri: file.uri, name, type: file.mimeType ?? guessed } as unknown as Blob);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}/requests/${requestId}/attachments?kind=${kind}`, {
    method: 'POST',
    headers,
    body: form,
  });
  if (!res.ok) throw new Error(errorMessage(await res.text()) || `${res.status}`);
}

// リンク先のプレビュー画像 (認証付き)
export function linkPreviewUrl(id: string): string {
  return `${API_URL}/link-previews/${id}/image`;
}

// 家事の見本画像 (認証付き)
export function choreImageUrl(id: string): string {
  return `${API_URL}/chore-images/${id}`;
}

// 認証付きで添付画像を表示するための URL
export function attachmentUrl(id: string): string {
  return `${API_URL}/attachments/${id}`;
}

// PDF など Image で表示できない添付は、短時間だけ有効な署名付き URL を発行して
// OS のビューア (ブラウザ) で開く。外部アプリには Authorization ヘッダを渡せないため。
export async function openAttachment(id: string): Promise<void> {
  const { path } = await apiFetch<{ path: string }>(`/attachments/${id}/link`);
  await Linking.openURL(`${API_URL}${path}`);
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (res.status === 401 && token && !path.startsWith('/auth/')) {
    // トークン切れ・テナント導入前の古いトークンはログインし直してもらう
    await clearToken();
    router.replace('/');
    throw new Error('セッションが切れました。再度ログインしてください。');
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(errorMessage(text) || `${res.status}`);
  }
  return (await res.json()) as T;
}

// API のエラーは {"error": "..."} 形式なので本文だけ取り出す
function errorMessage(text: string): string {
  try {
    const j = JSON.parse(text) as { error?: string };
    return j.error ?? text;
  } catch {
    return text;
  }
}
