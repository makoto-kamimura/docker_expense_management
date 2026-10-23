'use client';
import { useState, useTransition } from 'react';
import { commentAction } from '@/lib/actions';
import type { Member, PendingReply } from '@/lib/types';
import Avatar from './Avatar';
import Markdown from './Markdown';
import Octicon from './Octicon';

/** 名前を重ねずに「、」でつなぐ */
const joinNames = (names: string[]) => Array.from(new Set(names)).join('、');

/**
 * コメント欄。返事をお願いする相手を選ぶと、その人にボールが渡る (自分の番・通知)。
 * 自分宛ての返事のお願いがあれば、コメントすると返事済みになる
 */
export default function CommentForm({
  requestId,
  meId,
  meName,
  members,
  partyIds,
  waiting,
}: {
  requestId: string;
  meId: string;
  meName: string;
  /** 返事をお願いできる相手 (グループのメンバー) */
  members: Member[];
  /** 稟議の当事者 (申請者・レビュアー・担当者)。返事をお願いする相手の候補で先に並べる */
  partyIds: string[];
  /** まだ返事が来ていない返事のお願い */
  waiting: PendingReply[];
}) {
  const [body, setBody] = useState('');
  const [asks, setAsks] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [pending, start] = useTransition();

  const rank = (id: string) => (partyIds.includes(id) ? partyIds.indexOf(id) : partyIds.length);
  const candidates = members.filter((m) => m.id !== meId).sort((a, b) => rank(a.id) - rank(b.id));
  const askedNames = joinNames(candidates.filter((m) => asks.includes(m.id)).map((m) => m.name));
  const toMe = waiting.filter((w) => w.user.id === meId);
  const fromMe = waiting.filter((w) => w.asker?.id === meId);
  const toggle = (id: string) => setAsks((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <div className="comment-form">
      <Avatar name={meName} large />
      <form
        className="box"
        onSubmit={(e) => {
          e.preventDefault();
          if (!body.trim()) return;
          setErr(null);
          start(async () => {
            const r = await commentAction(requestId, body, asks);
            if (r?.error) setErr(r.error);
            else {
              setBody('');
              setAsks([]);
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
          {toMe.length > 0 && (
            <div className="ask-banner ask-banner-mine" role="status">
              <Octicon name="reply" />
              <span>
                <strong>{joinNames(toMe.map((w) => w.asker?.name ?? '退会したメンバー'))}</strong> から返事のお願いがあります。コメントすると返事済みになります。
              </span>
            </div>
          )}
          {fromMe.length > 0 && (
            <div className="ask-banner" role="status">
              <Octicon name="comment" />
              <span><strong>{joinNames(fromMe.map((w) => w.user.name))}</strong> の返事を待っています。</span>
            </div>
          )}
          {err && <div className="error">{err}</div>}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            // Ctrl / ⌘ + Enter で送る (GitHub と同じ)
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            aria-label="コメント"
            placeholder={toMe.length > 0 ? '返事を書きましょう' : '質問や感想を書きましょう'}
            hidden={preview}
            required
          />
          {preview && (
            <div className="md-preview">
              {body.trim() ? <Markdown>{body}</Markdown> : <span className="muted">プレビューする内容がありません。</span>}
            </div>
          )}
          {candidates.length > 0 && (
            <div className="ask-picker" role="group" aria-label="返事をお願いする人">
              <span className="muted small"><Octicon name="reply" size={12} /> 返事をお願いする</span>
              {candidates.map((m) => {
                const on = asks.includes(m.id);
                return (
                  <label key={m.id} className={`chip chip-sm${on ? ' chip-on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(m.id)} />
                    {m.name}
                  </label>
                );
              })}
            </div>
          )}
          <p className="muted small" style={{ marginTop: 8 }}>
            Markdown が使えます（箇条書き <code>- </code>・太字 <code>**太字**</code>・リンク <code>[文字](https://…)</code> など）。URL はそのままリンクになります。
            返事をお願いした人には通知が届き、その人の番になります。<kbd>Ctrl</kbd>+<kbd>Enter</kbd> で送れます。
          </p>
          <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="submit" className="btn-primary" disabled={pending || !body.trim()}>
              {asks.length > 0 ? `コメントして ${askedNames} に返事をお願いする` : 'コメントする'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
