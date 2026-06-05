import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

// API のベース URL を解決する。
// 開発時(Expo Go)は Metro を配信しているホスト(= Mac)の IP を hostUri から取得し、
// ポートだけバックエンドの 8080 に差し替える。これでネットワークが変わって IP が
// 変わっても、app.json を書き換えずに自動追従する。
// hostUri が無い場合(本番ビルド等)は app.json の extra.apiUrl、最後に localhost。
function resolveApiUrl(): string {
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

// 領収書画像を経費に添付する（multipart アップロード）。
export async function uploadReceipt(expenseId: string, uri: string): Promise<void> {
  const token = await getToken();
  const name = uri.split('/').pop() ?? 'receipt.jpg';
  const ext = /\.(\w+)$/.exec(name)?.[1]?.toLowerCase() ?? 'jpg';
  const type = ext === 'png' ? 'image/png' : 'image/jpeg';

  const form = new FormData();
  form.append('file', { uri, name, type } as unknown as Blob);

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/expenses/${expenseId}/receipts`, {
    method: 'POST',
    headers,
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status}`);
  }
}

// 認証付きで領収書画像を表示するための URL とヘッダ。
export function receiptUrl(id: string): string {
  return `${API_URL}/receipts/${id}`;
}

export async function authHeader(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status}`);
  }
  return (await res.json()) as T;
}
