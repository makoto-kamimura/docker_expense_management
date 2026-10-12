'use client';
import { useState, useTransition } from 'react';
import { commentAction } from '@/lib/actions';
import Avatar from './Avatar';
import Markdown from './Markdown';

export default function CommentForm({ requestId, meName }: { requestId: string; meName: string }) {
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="comment-form">
      <Avatar name={meName} large />
      <form
        className="box"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          start(async () => {
            const r = await commentAction(requestId, body);
            if (r?.error) setErr(r.error);
            else {
              setBody('');
              setPreview(false);
            }
          });
        }}
      >
        <div className="box-head">
          <h3>コメントを書く</h3>
          <nav className="md-tabs" aria-label="コメントの表示">
            <button type="button" className={preview ? '' : 'on'} aria-pressed={!preview} onClick={() => setPreview(false)}>書く</button>
            <button type="button" className={preview ? 'on' : ''} aria-pressed={preview} onClick={() => setPreview(true)}>プレビュー</button>
          </nav>
        </div>
        <div className="box-body">
          {err && <div className="error">{err}</div>}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="コメント"
            placeholder="質問や感想を書きましょう"
            hidden={preview}
            required
          />
          {preview && (
            <div className="md-preview">
              {body.trim() ? <Markdown>{body}</Markdown> : <span className="muted">プレビューする内容がありません。</span>}
            </div>
          )}
          <p className="muted small" style={{ marginTop: 8 }}>
            Markdown が使えます（箇条書き <code>- </code>・太字 <code>**太字**</code>・リンク <code>[文字](https://…)</code> など）。URL はそのままリンクになります。
          </p>
          <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="submit" className="btn-primary" disabled={pending || !body.trim()}>コメントする</button>
          </div>
        </div>
      </form>
    </div>
  );
}
