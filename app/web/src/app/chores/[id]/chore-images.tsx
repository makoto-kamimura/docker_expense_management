'use client';
import { useRef, useState, useTransition } from 'react';
import { deleteChoreImageAction, updateChoreImageAction, uploadChoreImageAction } from '@/lib/actions';
import type { ChoreImage } from '@/lib/types';

/** 見本画像の追加フォーム (管理者のみ) */
export function ImageUpload({ choreId, full }: { choreId: string; full: boolean }) {
  const ref = useRef<HTMLFormElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (full) return <p className="muted small" style={{ margin: '12px 0 0' }}>見本の画像は10枚までです。</p>;
  return (
    <form
      ref={ref}
      className="upload sample-upload"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setErr(null);
        start(async () => {
          const r = await uploadChoreImageAction(choreId, fd);
          if (r.error) setErr(r.error);
          else ref.current?.reset();
        });
      }}
    >
      <input name="file" type="file" required aria-label="見本の画像" accept="image/jpeg,image/png,image/webp" />
      <input name="caption" placeholder="この画像の説明 (任意) 例: コンロの五徳まで油はねがない" aria-label="画像の説明" maxLength={200} />
      <button type="submit" disabled={pending}>{pending ? 'アップロード中…' : '見本を追加'}</button>
      <span className="muted small">JPG・PNG・WEBP / 最大10MB / 1つの家事に10枚まで</span>
      {err && <div className="error" role="alert" style={{ width: '100%', margin: 0 }}>{err}</div>}
    </form>
  );
}

/** 見本画像の説明の編集と削除 (管理者のみ) */
export function ImageCaption({ image }: { image: ChoreImage }) {
  const [caption, setCaption] = useState(image.caption);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setErr(null);
      const r = await fn();
      if (r.error) setErr(r.error);
    });

  return (
    <form
      className="sample-caption"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateChoreImageAction(image.id, caption));
      }}
    >
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="この画像の説明 (どこを・どういう状態に保つか)"
        aria-label="画像の説明"
        maxLength={200}
        rows={2}
      />
      <div className="actions">
        <button type="submit" className="btn-sm" disabled={pending || caption === image.caption}>保存</button>
        <button
          type="button"
          className="btn-sm btn-danger"
          disabled={pending}
          onClick={() => {
            if (confirm('この見本の画像を削除しますか？')) run(() => deleteChoreImageAction(image.id));
          }}
        >
          削除
        </button>
      </div>
      {err && <div className="error" role="alert" style={{ margin: '6px 0 0' }}>{err}</div>}
    </form>
  );
}
