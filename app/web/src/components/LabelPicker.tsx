'use client';
import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { setRequestLabelsAction } from '@/lib/actions';
import type { Label } from '@/lib/types';
import LabelChip from './LabelChip';
import Octicon from './Octicon';

/** 稟議のラベルの付け外し (サイドバーの「編集」から開く。申請者とレビュアーのみ) */
export default function LabelPicker({
  requestId,
  labels,
  selected,
  canManage,
}: {
  requestId: string;
  /** 家族のラベルすべて */
  labels: Label[];
  /** この稟議に付いているラベルの ID */
  selected: string[];
  /** ラベル自体の追加・編集ができる (管理者) */
  canManage: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [checked, setChecked] = useState<string[]>(selected);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const changed = checked.length !== selected.length || checked.some((id) => !selected.includes(id));

  const toggle = (id: string) => setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const apply = () =>
    start(async () => {
      setErr(null);
      const r = await setRequestLabelsAction(requestId, checked);
      if (r.error) setErr(r.error);
      else ref.current?.removeAttribute('open');
    });

  return (
    <details
      ref={ref}
      className="label-picker"
      // 開くたびに今付いているラベルから始める (保存していない選択は捨てる)
      onToggle={(e) => { if (e.currentTarget.open) setChecked(selected); }}
    >
      <summary className="btn btn-sm"><Octicon name="tag" size={12} /> 編集</summary>
      <div className="label-picker-menu" role="group" aria-label="ラベルを選ぶ">
        {labels.length === 0 && <p className="muted small" style={{ margin: 8 }}>ラベルがありません。</p>}
        {labels.map((l) => (
          <label key={l.id} className="label-picker-item">
            <input type="checkbox" checked={checked.includes(l.id)} onChange={() => toggle(l.id)} disabled={pending} />
            <span>
              <LabelChip label={l} />
              {l.description && <span className="muted small"> {l.description}</span>}
            </span>
          </label>
        ))}
        {err && <div className="error" role="alert" style={{ margin: 8 }}>{err}</div>}
        <div className="label-picker-foot">
          {canManage ? <Link href="/settings#labels" className="small">ラベルを管理</Link> : <span />}
          <button type="button" className="btn-sm btn-primary" disabled={pending || !changed} onClick={apply}>適用</button>
        </div>
      </div>
    </details>
  );
}
