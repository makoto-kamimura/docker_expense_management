'use client';
import { useRef, useState, useTransition } from 'react';
import {
  createRequestTypeAction,
  deleteRequestTypeAction,
  reorderRequestTypesAction,
  updateRequestTypeAction,
} from '@/lib/actions';
import { KINDS, KIND_LABEL, KIND_TEXT, type RequestType } from '@/lib/types';

/** 稟議の種類の追加・名前とアイコンの変更・並び替え・非表示・削除 (管理者のみ) */
export default function RequestTypeSettings({ types }: { types: RequestType[] }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const addForm = useRef<HTMLFormElement>(null);
  const run = (fn: () => Promise<{ error?: string }>, after?: () => void) =>
    start(async () => {
      setErr(null);
      const r = await fn();
      if (r.error) setErr(r.error);
      else after?.();
    });
  const move = (i: number, d: -1 | 1) => {
    const ids = types.map((x) => x.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    run(() => reorderRequestTypesAction(ids));
  };

  return (
    <>
      {err && <div className="box-row"><div className="error" role="alert" style={{ margin: 0 }}>{err}</div></div>}
      {types.map((x, i) => (
        <div key={x.id} className="box-row chore-setting-row">
          <div className="chore-order">
            <button type="button" className="btn-sm" aria-label={`${x.name}を上へ`} disabled={pending || i === 0} onClick={() => move(i, -1)}>↑</button>
            <button type="button" className="btn-sm" aria-label={`${x.name}を下へ`} disabled={pending || i === types.length - 1} onClick={() => move(i, 1)}>↓</button>
          </div>
          <TypeRow type={x} pending={pending} run={run} />
        </div>
      ))}
      <form
        ref={addForm}
        action={(fd) => run(() => createRequestTypeAction(fd), () => addForm.current?.reset())}
        className="box-row actions"
      >
        <input name="icon" placeholder="📝" aria-label="種類のアイコン (絵文字)" maxLength={8} style={{ width: 56, textAlign: 'center' }} />
        <input name="name" placeholder="例: 備品の購入" aria-label="種類の名前" required maxLength={20} style={{ width: 180 }} />
        <select name="base" aria-label="種類の型" defaultValue="purchase" style={{ width: 'auto' }}>
          {KINDS.map((k) => <option key={k} value={k}>{KIND_TEXT[k].icon} {KIND_LABEL[k]}</option>)}
        </select>
        <button type="submit" disabled={pending}>追加</button>
      </form>
    </>
  );
}

function TypeRow({
  type,
  pending,
  run,
}: {
  type: RequestType;
  pending: boolean;
  run: (fn: () => Promise<{ error?: string }>) => void;
}) {
  const [name, setName] = useState(type.name);
  const [icon, setIcon] = useState(type.icon);
  const dirty = name !== type.name || icon !== type.icon;
  const save = (hidden: boolean) => run(() => updateRequestTypeAction(type.id, { name, icon, hidden }));

  return (
    <form
      className="actions"
      style={{ flex: 1 }}
      onSubmit={(e) => {
        e.preventDefault();
        save(type.hidden);
      }}
    >
      <input value={icon} onChange={(e) => setIcon(e.target.value)} aria-label="種類のアイコン (絵文字)" maxLength={8} style={{ width: 56, textAlign: 'center' }} />
      <input value={name} onChange={(e) => setName(e.target.value)} aria-label="種類の名前" required maxLength={20} style={{ width: 180 }} />
      <span className="muted small" style={{ minWidth: 120 }}>
        {KIND_LABEL[type.base]} · {type.request_count}件{type.hidden && ' · 非表示'}
      </span>
      <button type="submit" className="btn-sm" disabled={pending || !dirty}>保存</button>
      <button type="button" className="btn-sm" disabled={pending} onClick={() => save(!type.hidden)}>
        {type.hidden ? '表示する' : '非表示にする'}
      </button>
      {type.request_count === 0 && (
        <button
          type="button"
          className="btn-sm btn-danger"
          disabled={pending}
          onClick={() => {
            if (confirm(`種類「${type.name}」を削除しますか？`)) run(() => deleteRequestTypeAction(type.id));
          }}
        >
          削除
        </button>
      )}
    </form>
  );
}
