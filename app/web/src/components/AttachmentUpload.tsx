'use client';
import { useRef, useState, useTransition } from 'react';
import { deleteAttachmentAction, uploadAttachmentAction } from '@/lib/actions';

export default function AttachmentUpload({
  requestId,
  kind,
  label = 'アップロード',
}: {
  requestId: string;
  kind: 'evidence' | 'receipt';
  label?: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      ref={ref}
      className="upload"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setErr(null);
        start(async () => {
          const r = await uploadAttachmentAction(requestId, kind, fd);
          if (r?.error) setErr(r.error);
          else ref.current?.reset();
        });
      }}
    >
      <input
        name="file"
        type="file"
        required
        aria-label={kind === 'receipt' ? 'レシートのファイル' : '添付するファイル'}
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf"
      />
      <button type="submit" disabled={pending}>{pending ? 'アップロード中…' : label}</button>
      <span className="muted small">JPG・PNG・WEBP・HEIC・PDF / 最大10MB</span>
      {err && <div className="error" style={{ width: '100%', margin: 0 }}>{err}</div>}
    </form>
  );
}

export function AttachmentDelete({ requestId, attachmentId, name }: { requestId: string; attachmentId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn-danger btn-sm"
      aria-label={`${name} を削除`}
      disabled={pending}
      onClick={() => {
        if (!confirm(`${name} を削除しますか？`)) return;
        start(async () => {
          const r = await deleteAttachmentAction(requestId, attachmentId);
          if (r?.error) alert(r.error);
        });
      }}
    >
      ✕
    </button>
  );
}
