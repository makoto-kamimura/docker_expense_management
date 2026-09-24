'use client';
import { useState, useTransition } from 'react';
import { commentAction } from '@/lib/actions';
import Avatar from './Avatar';

export default function CommentForm({ requestId, meName }: { requestId: string; meName: string }) {
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
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
            else setBody('');
          });
        }}
      >
        <div className="box-head"><h3>コメントを書く</h3></div>
        <div className="box-body">
          {err && <div className="error">{err}</div>}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="コメント"
            placeholder="質問や感想を書きましょう"
            required
          />
          <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="submit" className="btn-primary" disabled={pending || !body.trim()}>コメントする</button>
          </div>
        </div>
      </form>
    </div>
  );
}
