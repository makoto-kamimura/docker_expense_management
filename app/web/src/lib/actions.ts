'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { apiFetch, getApiBase } from './api';
import type { Member, PushScope, RequestDetail } from './types';

const COOKIE_NAME = 'token';
type Result = { error?: string };

function setTokenCookie(token: string) {
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
}

/** API 呼び出しを包み、失敗したらフォームに表示するエラーを返す */
async function attempt(fn: () => Promise<unknown>): Promise<Result> {
  try {
    await fn();
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function loginAction(formData: FormData): Promise<Result> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  try {
    const res = await fetch(`${getApiBase()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });
    if (!res.ok) {
      if (res.status === 401) return { error: 'メールアドレスまたはパスワードが正しくありません' };
      const j = await res.json().catch(() => ({}));
      return { error: j.error ?? 'ログインできませんでした' };
    }
    const data = (await res.json()) as { token: string; user: Member };
    setTokenCookie(data.token);
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect('/');
}

export async function registerAction(formData: FormData): Promise<Result> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const name = String(formData.get('name') ?? '');
  // 「家族を作る」なら family_name、「招待コードで参加」なら invite_code だけを送る
  const joining = formData.get('mode') === 'join';
  const family = joining
    ? { invite_code: String(formData.get('invite_code') ?? '') }
    : { family_name: String(formData.get('family_name') ?? '') };
  try {
    const res = await fetch(`${getApiBase()}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, ...family }),
      cache: 'no-store',
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return { error: j.error ?? 'アカウントを作成できませんでした' };
    }
    const data = (await res.json()) as { token: string; user: Member };
    setTokenCookie(data.token);
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect('/onboarding');
}

export async function logoutAction() {
  cookies().delete(COOKIE_NAME);
  redirect('/login');
}

export async function completeOnboardingAction(next: string) {
  await apiFetch('/me/onboarded', { method: 'POST', body: '{}' });
  revalidatePath('/', 'layout');
  redirect(next);
}

// ---------------------------------------------------------------------------
// Purchase Request
// ---------------------------------------------------------------------------

// RequestForm の入力を API の RequestInput に変換する。
// 比較商品は動的に増減するのでクライアント側で JSON にまとめて alternatives_json で送っている。
function requestPayload(formData: FormData) {
  const text = (k: string) => String(formData.get(k) ?? '').trim();
  const opt = (k: string) => text(k) || null;
  let alternatives: unknown[] = [];
  try {
    alternatives = JSON.parse(String(formData.get('alternatives_json') ?? '[]'));
  } catch {
    alternatives = [];
  }
  return {
    kind: text('kind') || 'purchase',
    parent_id: opt('parent_id'),
    title: text('title'),
    reason: text('reason'),
    price: Number(formData.get('price') ?? 0),
    seller: text('seller'),
    product_name: opt('product_name'),
    product_url: opt('product_url'),
    planned_date: opt('planned_date'),
    // 帰る日はお出かけのときだけ
    end_date: text('kind') === 'outing' ? opt('end_date') : null,
    notes: opt('notes'),
    reviewer_ids: formData.getAll('reviewer_ids').map(String),
    label_ids: formData.getAll('label_ids').map(String),
    alternatives,
  };
}

/** 保存し、submit=true なら続けて申請する */
export async function saveRequestAction(id: string | null, formData: FormData): Promise<Result> {
  const submit = formData.get('intent') === 'submit';
  let saved: RequestDetail;
  try {
    saved = await apiFetch<RequestDetail>(id ? `/requests/${id}` : '/requests', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(requestPayload(formData)),
    });
    if (submit) {
      await apiFetch(`/requests/${saved.request.id}/submit`, { method: 'POST', body: '{}' });
    }
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/');
  redirect(`/requests/${saved.request.id}`);
}

export async function deleteRequestAction(id: string) {
  await apiFetch(`/requests/${id}`, { method: 'DELETE' });
  revalidatePath('/');
  redirect('/');
}

/** 詳細画面のボタン操作 (submit / approve / request-changes / reject / merge / close) */
export async function requestActionAction(
  id: string,
  action: 'submit' | 'approve' | 'request-changes' | 'reject' | 'merge' | 'close' | 'reopen',
  comment?: string,
): Promise<Result> {
  const r = await attempt(() =>
    apiFetch(`/requests/${id}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ comment: comment?.trim() || null }),
    }),
  );
  revalidatePath(`/requests/${id}`);
  revalidatePath('/');
  return r;
}

export async function commentAction(id: string, body: string): Promise<Result> {
  const r = await attempt(() =>
    apiFetch(`/requests/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
  );
  revalidatePath(`/requests/${id}`);
  return r;
}

export async function markPurchasedAction(id: string, formData: FormData): Promise<Result> {
  const r = await attempt(() =>
    apiFetch(`/requests/${id}/purchase`, {
      method: 'POST',
      body: JSON.stringify({
        actual_price: Number(formData.get('actual_price') ?? 0),
        purchase_date: String(formData.get('purchase_date') ?? ''),
        order_number: String(formData.get('order_number') ?? '').trim() || null,
        final_product_url: String(formData.get('final_product_url') ?? '').trim() || null,
      }),
    }),
  );
  if (r.error) return r;
  revalidatePath('/');
  redirect(`/requests/${id}`);
}

export async function uploadAttachmentAction(
  id: string,
  kind: 'evidence' | 'receipt',
  formData: FormData,
): Promise<Result> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'ファイルを選択してください' };
  const body = new FormData();
  body.append('file', file, file.name);
  const r = await attempt(() => apiFetch(`/requests/${id}/attachments?kind=${kind}`, { method: 'POST', body }));
  revalidatePath(`/requests/${id}`);
  return r;
}

export async function deleteAttachmentAction(requestId: string, attachmentId: string): Promise<Result> {
  const r = await attempt(() => apiFetch(`/attachments/${attachmentId}`, { method: 'DELETE' }));
  revalidatePath(`/requests/${requestId}`);
  return r;
}

// ---------------------------------------------------------------------------
// Family Settings
// ---------------------------------------------------------------------------

export async function updateFamilyNameAction(formData: FormData) {
  await apiFetch('/family', {
    method: 'PUT',
    body: JSON.stringify({ name: String(formData.get('name') ?? '') }),
  });
  revalidatePath('/', 'layout');
}

export async function regenerateInviteCodeAction() {
  await apiFetch('/family/invite-code', { method: 'POST', body: '{}' });
  revalidatePath('/settings');
}

export async function updateMemberAction(userId: string, formData: FormData): Promise<Result> {
  const r = await attempt(() =>
    apiFetch(`/family/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({
        can_request: formData.get('can_request') === 'on',
        can_review: formData.get('can_review') === 'on',
        is_admin: formData.get('is_admin') === 'on',
      }),
    }),
  );
  revalidatePath('/settings');
  return r;
}

// ---------------------------------------------------------------------------
// Chores (家事のコミット)
// ---------------------------------------------------------------------------

/** 今日の分をコミットする / 取り消す */
export async function toggleChoreCommitAction(choreId: string, commit: boolean): Promise<Result> {
  const r = await attempt(() => apiFetch(`/chores/${choreId}/commit`, { method: commit ? 'POST' : 'DELETE' }));
  revalidatePath('/chores', 'layout');
  return r;
}

export async function createChoreAction(formData: FormData): Promise<Result> {
  const r = await attempt(() =>
    apiFetch('/chores', {
      method: 'POST',
      body: JSON.stringify({
        name: String(formData.get('name') ?? ''),
        icon: String(formData.get('icon') ?? '').trim() || null,
        description: String(formData.get('description') ?? '').trim(),
        ...choreSchedule(formData),
      }),
    }),
  );
  revalidatePath('/settings');
  revalidatePath('/chores', 'layout');
  return r;
}

/** 所要時間・推奨頻度の入力 (空欄は未設定 = null) */
function choreSchedule(formData: FormData) {
  const num = (k: string) => {
    const v = String(formData.get(k) ?? '').trim();
    return v ? Number(v) : null;
  };
  return {
    duration_minutes: num('duration_minutes'),
    frequency_period: String(formData.get('frequency_period') ?? '') || null,
    frequency_times: num('frequency_times'),
  };
}

export async function updateChoreAction(
  choreId: string,
  input: {
    name: string;
    icon: string;
    description: string;
    archived: boolean;
    duration_minutes: number | null;
    frequency_period: string | null;
    frequency_times: number | null;
  },
): Promise<Result> {
  const r = await attempt(() => apiFetch(`/chores/${choreId}`, { method: 'PUT', body: JSON.stringify(input) }));
  revalidatePath('/settings');
  revalidatePath('/chores', 'layout');
  return r;
}

/** 種類 (すべて / 毎日 / 週 / 月) ごとに、対象の家事をすべてクリアしたらプッシュしてトロフィーを取る (取り消せない) */
export async function pushChoresAction(scope: PushScope): Promise<Result> {
  const r = await attempt(() => apiFetch('/chores/push', { method: 'POST', body: JSON.stringify({ scope }) }));
  revalidatePath('/chores', 'layout');
  revalidatePath('/dashboard');
  return r;
}

/** 家事の並び順を変える。家族の家事 (非表示を含む) の ID を表示したい順にすべて渡す */
export async function reorderChoresAction(ids: string[]): Promise<Result> {
  const r = await attempt(() => apiFetch('/chores/order', { method: 'PUT', body: JSON.stringify({ ids }) }));
  revalidatePath('/settings');
  revalidatePath('/chores', 'layout');
  revalidatePath('/dashboard');
  return r;
}

/** 家事の見本画像 (きれいな状態) を追加する。file と caption を multipart で送る */
export async function uploadChoreImageAction(choreId: string, formData: FormData): Promise<Result> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: '画像を選択してください' };
  const body = new FormData();
  body.append('file', file, file.name);
  body.append('caption', String(formData.get('caption') ?? ''));
  const r = await attempt(() => apiFetch(`/chores/${choreId}/images`, { method: 'POST', body }));
  revalidatePath('/chores', 'layout');
  revalidatePath('/settings');
  return r;
}

export async function updateChoreImageAction(imageId: string, caption: string): Promise<Result> {
  const r = await attempt(() =>
    apiFetch(`/chore-images/${imageId}`, { method: 'PUT', body: JSON.stringify({ caption }) }),
  );
  revalidatePath('/chores', 'layout');
  return r;
}

export async function deleteChoreImageAction(imageId: string): Promise<Result> {
  const r = await attempt(() => apiFetch(`/chore-images/${imageId}`, { method: 'DELETE' }));
  revalidatePath('/chores', 'layout');
  revalidatePath('/settings');
  return r;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** 稟議のラベルを、渡した ID の集合に置き換える */
export async function setRequestLabelsAction(requestId: string, labelIds: string[]): Promise<Result> {
  const r = await attempt(() =>
    apiFetch(`/requests/${requestId}/labels`, { method: 'PUT', body: JSON.stringify({ label_ids: labelIds }) }),
  );
  revalidatePath(`/requests/${requestId}`);
  revalidatePath('/');
  return r;
}

export async function createLabelAction(formData: FormData): Promise<Result> {
  const r = await attempt(() =>
    apiFetch('/labels', {
      method: 'POST',
      body: JSON.stringify({
        name: String(formData.get('name') ?? ''),
        color: String(formData.get('color') ?? ''),
        description: String(formData.get('description') ?? '').trim(),
      }),
    }),
  );
  revalidatePath('/settings');
  return r;
}

export async function updateLabelAction(
  labelId: string,
  input: { name: string; color: string; description: string },
): Promise<Result> {
  const r = await attempt(() => apiFetch(`/labels/${labelId}`, { method: 'PUT', body: JSON.stringify(input) }));
  revalidatePath('/', 'layout');
  return r;
}

export async function deleteLabelAction(labelId: string): Promise<Result> {
  const r = await attempt(() => apiFetch(`/labels/${labelId}`, { method: 'DELETE' }));
  revalidatePath('/', 'layout');
  return r;
}
