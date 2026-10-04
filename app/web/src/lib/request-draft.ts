import type { RequestDraft } from '@/components/RequestForm';
import type { RequestDetail } from './types';

/** 稟議の詳細から、フォームの初期値を作る (編集と複製で使う) */
export function draftFromDetail(d: RequestDetail): RequestDraft {
  const r = d.request;
  return {
    type_id: r.type_id,
    title: r.title,
    reason: r.reason,
    price: r.price,
    seller: r.seller,
    product_name: r.product_name,
    product_url: r.product_url,
    label_ids: d.labels.map((l) => l.id),
    planned_date: r.planned_date,
    end_date: r.end_date,
    notes: r.notes,
    reviewer_ids: d.reviewers.map((x) => x.id),
    alternatives: d.alternatives.map((a) => ({
      name: a.name,
      price: a.price == null ? '' : String(a.price),
      url: a.url ?? '',
      notes: a.notes ?? '',
    })),
  };
}
