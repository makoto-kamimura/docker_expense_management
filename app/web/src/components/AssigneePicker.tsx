'use client';
import { useRef, useState, useTransition } from 'react';
import { setAssigneeAction } from '@/lib/actions';
import type { Member } from '@/lib/types';
import Avatar from './Avatar';
import Octicon from './Octicon';

/** 担当者 (マージされたあとに動く人) の変更。サイドバーの「変更」から開き、選ぶとすぐに保存する */
export default function AssigneePicker({
  requestId,
  members,
  requesterId,
  requesterName,
  selected,
}: {
  requestId: string;
  /** グループのメンバー (担当者の候補) */
  members: Member[];
  requesterId: string;
  requesterName: string;
  /** 今の担当者 (null なら申請者が動く) */
  selected: string | null;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const choose = (id: string | null) =>
    start(async () => {
      setErr(null);
      const r = await setAssigneeAction(requestId, id);
      if (r.error) setErr(r.error);
      else ref.current?.removeAttribute('open');
    });

  const options = [
    { id: null, name: `${requesterName} (申請者)` },
    ...members.filter((m) => m.id !== requesterId).map((m) => ({ id: m.id as string | null, name: m.name })),
  ];

  return (
    <details ref={ref} className="label-picker">
      <summary className="btn btn-sm"><Octicon name="person" size={12} /> 変更</summary>
      <div className="label-picker-menu" role="radiogroup" aria-label="担当者を選ぶ">
        {options.map((o) => (
          <label key={o.id ?? 'requester'} className="label-picker-item">
            <input type="radio" name="assignee" checked={o.id === selected} onChange={() => choose(o.id)} disabled={pending} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Avatar name={o.name} />{o.name}</span>
          </label>
        ))}
        {err && <div className="error" role="alert" style={{ margin: 8 }}>{err}</div>}
        <p className="muted small" style={{ margin: 0, padding: '8px 12px' }}>マージされたら、担当者の番になります。</p>
      </div>
    </details>
  );
}
