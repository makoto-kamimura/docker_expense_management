'use client';
import { useRef, useState, useTransition } from 'react';
import { createLabelAction, deleteLabelAction, updateLabelAction } from '@/lib/actions';
import type { Label } from '@/lib/types';
import LabelChip from '@/components/LabelChip';

/** 新しいラベルの色の候補 (GitHub のラベルの色に近いもの) */
const COLORS = ['#d1242f', '#bf3989', '#8250df', '#0969da', '#1a7f37', '#bf8700', '#bc4c00', '#59636e'];

/** ラベルの追加・名前や色の変更・削除 (管理者のみ) */
export default function LabelSettings({ labels }: { labels: Label[] }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const addForm = useRef<HTMLFormElement>(null);
  const [newColor, setNewColor] = useState(COLORS[labels.length % COLORS.length]);

  const add = (fd: FormData) =>
    start(async () => {
      setErr(null);
      const r = await createLabelAction(fd);
      if (r.error) setErr(r.error);
      else {
        addForm.current?.reset();
        setNewColor(COLORS[(labels.length + 1) % COLORS.length]);
      }
    });

  return (
    <>
      {err && <div className="box-row"><div className="error" role="alert" style={{ margin: 0 }}>{err}</div></div>}
      {labels.length === 0 && <div className="box-row muted">ラベルはまだありません。</div>}
      {labels.map((l) => <LabelRow key={l.id} label={l} onError={setErr} />)}
      <form ref={addForm} action={add} className="box-row actions">
        <input type="color" name="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} aria-label="ラベルの色" className="color-input" />
        <input name="name" placeholder="例: 急ぎ" aria-label="ラベルの名前" required maxLength={30} style={{ width: 180 }} />
        <input name="description" placeholder="説明 (任意)" aria-label="ラベルの説明" maxLength={100} style={{ flex: 1, minWidth: 160 }} />
        <button type="submit" disabled={pending}>追加</button>
      </form>
    </>
  );
}

function LabelRow({ label, onError }: { label: Label; onError: (e: string | null) => void }) {
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState(label.color);
  const [description, setDescription] = useState(label.description);
  const [pending, start] = useTransition();
  const dirty = name !== label.name || color !== label.color || description !== label.description;
  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      onError(null);
      const r = await fn();
      if (r.error) onError(r.error);
    });

  return (
    <form
      className="box-row actions"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateLabelAction(label.id, { name, color, description }));
      }}
    >
      <span style={{ width: 140 }}><LabelChip label={{ ...label, name: name || label.name, color }} /></span>
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label={`${label.name}の色`} className="color-input" />
      <input value={name} onChange={(e) => setName(e.target.value)} aria-label="ラベルの名前" required maxLength={30} style={{ width: 180 }} />
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="説明 (任意)" aria-label="ラベルの説明" maxLength={100} style={{ flex: 1, minWidth: 160 }} />
      <button type="submit" className="btn-sm" disabled={pending || !dirty}>保存</button>
      <button
        type="button"
        className="btn-sm btn-danger"
        disabled={pending}
        onClick={() => {
          if (confirm(`ラベル「${label.name}」を削除しますか？\n付いている稟議からも外れます。`)) run(() => deleteLabelAction(label.id));
        }}
      >
        削除
      </button>
    </form>
  );
}
