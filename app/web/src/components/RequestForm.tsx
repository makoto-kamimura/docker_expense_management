'use client';
import { useState, useTransition } from 'react';
import {
  KINDS,
  KIND_TEXT,
  type Label,
  type Member,
  type RequestKind,
} from '@/lib/types';
import LabelChip from './LabelChip';

export interface AlternativeDraft {
  name: string;
  price: string;
  url: string;
  notes: string;
}

export interface RequestDraft {
  kind?: RequestKind;
  title?: string;
  reason?: string;
  price?: number;
  seller?: string;
  product_name?: string | null;
  product_url?: string | null;
  label_ids?: string[];
  planned_date?: string | null;
  end_date?: string | null;
  notes?: string | null;
  reviewer_ids?: string[];
  alternatives?: AlternativeDraft[];
}

const emptyAlternative = (): AlternativeDraft => ({ name: '', price: '', url: '', notes: '' });

export default function RequestForm({
  action,
  defaults,
  members,
  labels,
  selfId,
  currency,
  canSubmit = true,
  parentId,
}: {
  action: (fd: FormData) => Promise<{ error?: string }>;
  defaults?: RequestDraft;
  /** Reviewer 候補 (同じ家族のメンバー) */
  members: Member[];
  /** 家族のラベル (付けるものを選ぶ) */
  labels: Label[];
  selfId: string;
  currency: string;
  /** false なら「申請する」ボタンを出さない (Submitted 以降の状態では使わない想定) */
  canSubmit?: boolean;
  /** 分岐元の稟議 (新規作成時のみ) */
  parentId?: string;
}) {
  const [alternatives, setAlternatives] = useState<AlternativeDraft[]>(defaults?.alternatives ?? []);
  const [reviewers, setReviewers] = useState<string[]>(defaults?.reviewer_ids ?? []);
  const [kind, setKind] = useState<RequestKind>(defaults?.kind ?? 'purchase');
  const [labelIds, setLabelIds] = useState<string[]>(defaults?.label_ids ?? []);
  const t = KIND_TEXT[kind];
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const candidates = members.filter((m) => m.id !== selfId && m.can_review);

  const setAlt = (i: number, patch: Partial<AlternativeDraft>) =>
    setAlternatives((prev) => prev.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const toggleReviewer = (id: string) =>
    setReviewers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const fd = new FormData(e.currentTarget);
        fd.set('intent', submitter?.value ?? 'save');
        fd.set(
          'alternatives_json',
          JSON.stringify(
            alternatives
              .filter((a) => a.name.trim())
              .map((a) => ({
                name: a.name,
                price: a.price === '' ? null : Number(a.price),
                url: a.url || null,
                notes: a.notes || null,
              })),
          ),
        );
        fd.delete('reviewer_ids');
        reviewers.forEach((id) => fd.append('reviewer_ids', id));
        fd.delete('label_ids');
        labelIds.forEach((id) => fd.append('label_ids', id));
        setError(null);
        start(async () => {
          const r = await action(fd);
          if (r?.error) {
            setError(r.error);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        });
      }}
    >
      {error && <div className="error" role="alert">{error}</div>}
      {parentId && <input type="hidden" name="parent_id" value={parentId} />}

      <div className="box">
        <div className="box-head"><h2>稟議の種類</h2></div>
        <div className="box-body">
          <div className="chips" role="radiogroup" aria-label="稟議の種類">
            {KINDS.map((k) => (
              <label key={k} className={`chip${kind === k ? ' chip-on' : ''}`}>
                <input
                  type="radio"
                  name="kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                />
                {KIND_TEXT[k].icon} {KIND_TEXT[k].what}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="box">
        <div className="box-head"><h2>{t.what}</h2></div>
        <div className="box-body">
          <div className="row">
            <label htmlFor="title">タイトル<span className="req">*</span></label>
            <input id="title" name="title" required maxLength={200} defaultValue={defaults?.title ?? ''} placeholder={t.titleExample} />
          </div>
          <div className="form-grid">
            <div className="row">
              <label htmlFor="price">{t.price}<span className="req">*</span><span className="hint">{currency === 'JPY' ? '円' : currency}</span></label>
              <input id="price" name="price" type="number" min={0} step={1} required defaultValue={defaults?.price ?? ''} placeholder="128000" />
            </div>
            <div className="row">
              <label htmlFor="seller">{t.seller}{t.sellerRequired && <span className="req">*</span>}</label>
              <input id="seller" name="seller" defaultValue={defaults?.seller ?? ''} placeholder={t.sellerExample} />
            </div>
          </div>
          <div className="form-grid">
            <div className="row">
              <label htmlFor="product_name">{t.product}{t.productRequired && <span className="req">*</span>}</label>
              <input id="product_name" name="product_name" defaultValue={defaults?.product_name ?? ''} placeholder={t.productExample} />
            </div>
            <div className="row">
              <label htmlFor="product_url">{t.productUrl}</label>
              <input id="product_url" name="product_url" type="url" pattern="https?://.+" defaultValue={defaults?.product_url ?? ''} placeholder="https://..." />
            </div>
          </div>
          <div className="row">
            <span className="label-like">ラベル<span className="hint">いくつでも</span></span>
            <div className="chips" role="group" aria-label="ラベル">
              {labels.length === 0 && <span className="muted small">ラベルがありません (設定画面で追加できます)</span>}
              {labels.map((l) => {
                const on = labelIds.includes(l.id);
                return (
                  <label key={l.id} className={`chip label-choice${on ? ' chip-on' : ''}`} title={l.description || undefined}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setLabelIds((c) => (on ? c.filter((x) => x !== l.id) : [...c, l.id]))}
                    />
                    <LabelChip label={l} />
                  </label>
                );
              })}
            </div>
          </div>
          <div className="form-grid">
            <div className="row">
              <label htmlFor="planned_date">{t.date}</label>
              <input id="planned_date" name="planned_date" type="date" defaultValue={defaults?.planned_date ?? ''} />
            </div>
            {t.hasEndDate && (
              <div className="row">
                <label htmlFor="end_date">帰る日<span className="hint">日帰りなら空欄</span></label>
                <input id="end_date" name="end_date" type="date" defaultValue={defaults?.end_date ?? ''} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="box">
        <div className="box-head"><h2>{t.reason}<span className="req">*</span></h2></div>
        <div className="box-body">
          <div className="row" style={{ marginBottom: 8 }}>
            <label htmlFor="reason" className="sr-only">{t.reason}</label>
            <textarea
              id="reason"
              name="reason"
              rows={6}
              defaultValue={defaults?.reason ?? ''}
              placeholder={t.reasonPlaceholder}
            />
          </div>
          <p className="muted small">
            {t.reasonHint}
          </p>
        </div>
      </div>

      <div className="box">
        <div className="box-head">
          <h2>{t.alternatives}</h2>
          <button type="button" className="btn-sm" onClick={() => setAlternatives((p) => [...p, emptyAlternative()])}>
            追加
          </button>
        </div>
        <div className="box-body">
          {alternatives.length === 0 && <p className="muted" style={{ margin: 0 }}>まだありません。他の候補と比べると説得力が増します。</p>}
          {alternatives.map((a, i) => (
            <div key={i} className="form-grid" style={{ alignItems: 'end', borderTop: i ? '1px solid var(--border-muted)' : 0, paddingTop: i ? 12 : 0 }}>
              <div className="row">
                <label>{t.altName}</label>
                <input value={a.name} onChange={(e) => setAlt(i, { name: e.target.value })} placeholder={t.altExample} />
              </div>
              <div className="row">
                <label>{t.priceShort}</label>
                <input type="number" min={0} value={a.price} onChange={(e) => setAlt(i, { price: e.target.value })} />
              </div>
              <div className="row">
                <label>URL</label>
                <input type="url" pattern="https?://.+" value={a.url} onChange={(e) => setAlt(i, { url: e.target.value })} placeholder="https://..." />
              </div>
              <div className="row">
                <label>メモ</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={a.notes} onChange={(e) => setAlt(i, { notes: e.target.value })} />
                  <button type="button" className="btn-danger btn-sm" aria-label={`比較商品${i + 1}を削除`} onClick={() => setAlternatives((p) => p.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="box">
        <div className="box-head"><h2>レビュアー<span className="req">*</span> <span className="ja">確認・承認してもらう家族</span></h2></div>
        <div className="box-body">
          {candidates.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              レビューできる家族がまだいません。<a href="/settings">設定</a>から家族を招待してください。
            </p>
          ) : (
            <div className="chips">
              {candidates.map((m) => (
                <label key={m.id} className={`chip${reviewers.includes(m.id) ? ' chip-on' : ''}`}>
                  <input type="checkbox" checked={reviewers.includes(m.id)} onChange={() => toggleReviewer(m.id)} />
                  {m.name}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="box">
        <div className="box-head"><h2>メモ <span className="ja">任意</span></h2></div>
        <div className="box-body">
          <textarea id="notes" name="notes" aria-label="メモ" defaultValue={defaults?.notes ?? ''} />
          <p className="muted small" style={{ marginTop: 8 }}>資料 (見積書・スクリーンショット・PDF) は保存後に添付できます。</p>
        </div>
      </div>

      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <button type="submit" value="save" disabled={pending}>下書き保存</button>
        {canSubmit && (
          <button type="submit" value="submit" className="btn-primary" disabled={pending}>
            {pending ? '保存中…' : 'レビューを依頼する'}
          </button>
        )}
      </div>
    </form>
  );
}
