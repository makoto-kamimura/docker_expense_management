'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { deleteRequestAction, requestActionAction } from '@/lib/actions';
import { money } from '@/lib/format';
import { KIND_TEXT, type RequestDetail } from '@/lib/types';
import ConfirmButton from './ConfirmButton';
import Octicon, { type IconName } from './Octicon';

type Action = 'submit' | 'approve' | 'request-changes' | 'reject' | 'merge' | 'close' | 'reopen';

/**
 * 詳細画面下部の「次にやること」パネル。状態とログインユーザーの権限 (API の permissions) で内容が変わる。
 */
export default function StatusPanel({ detail, meId }: { detail: RequestDetail; meId: string }) {
  const { request: r, permissions: p, reviewers } = detail;
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const price = money(r.price, r.currency);
  const isRequester = r.requester_id === meId;
  const reviewerNames = reviewers.map((x) => x.name).join('、') || '(未指定)';
  const t = KIND_TEXT[r.kind];

  const run = (action: Action, withComment = false) =>
    start(async () => {
      setError(null);
      const res = await requestActionAction(r.id, action, withComment ? comment : undefined);
      if (res.error) setError(res.error);
      else setComment('');
    });

  const errorBox = error && <div className="error" role="alert">{error}</div>;

  // ---- Draft ----
  if (r.status === 'draft') {
    return (
      <Panel icon="pr-draft" color="gray" title="この稟議は下書きです" sub="家族にはまだ見えていません。内容を確認してレビューを依頼しましょう。">
        {errorBox}
        {p.can_edit && !p.can_submit && <p className="muted">レビューを依頼するには、編集画面でレビュアーを1人以上選んでください。</p>}
        <div className="actions">
          {p.can_edit && <Link className="btn" href={`/requests/${r.id}/edit`}>編集</Link>}
          {p.can_submit && <button className="btn-primary" disabled={pending} onClick={() => run('submit')}>レビューを依頼する</button>}
          {p.can_delete && (
            <ConfirmButton
              label="削除"
              className="btn-danger"
              title="この下書きを削除しますか？"
              confirmLabel="削除する"
              confirmClassName="btn-danger"
              onConfirm={() => deleteRequestAction(r.id)}
            >
              <p>この操作は取り消せません。</p>
            </ConfirmButton>
          )}
        </div>
      </Panel>
    );
  }

  // ---- Waiting for review / Under review ----
  if (r.status === 'submitted' || r.status === 'under_review') {
    if (p.can_approve) {
      return (
        <Panel icon="eye" color="yellow" title="あなたのレビューが依頼されています" sub="金額・理由・リンク・資料を確認して、承認か修正依頼をしてください。">
          {errorBox}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            aria-label="レビューコメント"
            placeholder="コメント (修正依頼のときは必須)"
          />
          <div className="actions" style={{ marginTop: 8 }}>
            <button disabled={pending || !comment.trim()} onClick={() => run('request-changes', true)}>
              修正を依頼
            </button>
            <ConfirmButton
              label="承認する"
              className="btn-primary"
              title="この稟議を承認しますか？"
              confirmLabel="承認する"
              confirmClassName="btn-primary"
              disabled={pending}
              onConfirm={() => run('approve', true)}
            >
              <p>{t.thing}の稟議を承認します。</p>
              <p className="muted" style={{ margin: 0 }}>{t.priceShort}</p>
              <p style={{ fontSize: 24, fontWeight: 600 }}>{price}</p>
            </ConfirmButton>
            <RejectButton pending={pending} onReject={() => run('reject', true)} />
          </div>
        </Panel>
      );
    }
    return (
      <Panel icon="dot" color="yellow" title={`${reviewerNames} のレビュー待ちです`} sub="家族が確認しています。質問にはコメントで答えましょう。">
        {errorBox}
        {p.can_close && <WithdrawButton pending={pending} onWithdraw={() => run('close')} />}
      </Panel>
    );
  }

  // ---- Changes needed ----
  if (r.status === 'changes_needed') {
    return (
      <Panel icon="redo" color="red" title="修正が依頼されています" sub="アクティビティのコメントを確認して、内容を更新してください。">
        {errorBox}
        <div className="actions">
          {p.can_edit && <Link className="btn" href={`/requests/${r.id}/edit`}>稟議を編集</Link>}
          {p.can_submit && <button className="btn-primary" disabled={pending} onClick={() => run('submit')}>再度レビューを依頼</button>}
          {p.can_close && <WithdrawButton pending={pending} onWithdraw={() => run('close')} />}
          {p.can_reject && <RejectButton pending={pending} onReject={() => run('reject')} />}
          {!isRequester && !p.can_reject && <span className="muted">申請者の修正を待っています。</span>}
        </div>
      </Panel>
    );
  }

  // ---- Approved → Merge ----
  if (r.status === 'approved') {
    const approvers = reviewers.filter((x) => x.decision === 'approved').map((x) => x.name).join('、');
    return (
      <>
        <Panel icon="check" color="green" title={`${approvers || '家族'} が承認しました`} sub="レビューが完了しました。" />
        <Panel icon="merge" color="purple" title="マージできます" sub={t.mergeSub}>
          {errorBox}
          <p className="muted">
            マージすると、{t.thing}は家族に承認されたものとして扱われます (稟議成立)。
          </p>
          <div className="actions">
            {p.can_merge ? (
              <ConfirmButton
                label="マージする"
                className="btn-merge"
                title="この稟議をマージしますか？"
                confirmLabel="マージする"
                confirmClassName="btn-merge"
                disabled={pending}
                onConfirm={() => run('merge')}
              >
                <p>家族が{t.thing}に合意したことを確定します。</p>
                <p style={{ fontSize: 20, fontWeight: 600 }}>{r.title} — {price}</p>
              </ConfirmButton>
            ) : (
              <span className="muted">マージできるのは申請者かレビュアーです。</span>
            )}
            {p.can_reject && <RejectButton pending={pending} onReject={() => run('reject')} />}
            {p.can_close && <WithdrawButton pending={pending} onWithdraw={() => run('close')} />}
          </div>
        </Panel>
      </>
    );
  }

  // ---- Merged → Purchase ----
  if (r.status === 'merged') {
    return (
      <Panel icon="merge" color="purple" title="マージ済み" sub={t.mergedSub}>
        {errorBox}
        <div className="actions">
          {p.can_mark_purchased ? (
            <Link className="btn btn-blue" href={`/requests/${r.id}/purchase`}>{t.markDone}</Link>
          ) : (
            <span className="muted">{t.waitingDone}</span>
          )}
          {p.can_close && <WithdrawButton pending={pending} onWithdraw={() => run('close')} />}
        </div>
      </Panel>
    );
  }

  // ---- Purchased ----
  if (r.status === 'purchased') {
    return (
      <Panel icon="bag" color="blue" title={t.done} sub={t.doneSub}>
        <dl className="facts">
          <dt>{t.actualPrice}</dt><dd><strong>{money(r.actual_price, r.currency)}</strong>
            {r.actual_price != null && r.actual_price !== r.price && (
              <span className="muted"> (申請時 {price})</span>
            )}
          </dd>
          <dt>{t.doneDate}</dt><dd>{r.purchase_date ?? '—'}</dd>
          {r.order_number && (<><dt>{t.orderNo}</dt><dd>{r.order_number}</dd></>)}
          {r.final_product_url && (
            <><dt>{t.finalUrl}</dt><dd><a href={r.final_product_url} target="_blank" rel="noopener noreferrer">{r.final_product_url}</a></dd></>
          )}
        </dl>
      </Panel>
    );
  }

  // ---- Closed ----
  return (
    <Panel
      icon="pr-closed"
      color="red"
      title={r.close_reason === 'withdrawn' ? '申請者が取り下げました' : '却下されました'}
      sub="この稟議はクローズしています。"
    >
      {errorBox}
      {p.can_reopen && (
        <div className="actions">
          <ConfirmButton
            label="再オープン"
            title="この稟議を再オープンしますか？"
            confirmLabel="再オープンする"
            confirmClassName="btn-primary"
            disabled={pending}
            onConfirm={() => run('reopen')}
          >
            <p>レビュー待ちに戻して、もう一度レビューしてもらいます。</p>
            <p className="muted">レビュアーの判定はリセットされます。内容を直したいときは、再オープン後にレビュアーから修正依頼を受けてください。</p>
          </ConfirmButton>
        </div>
      )}
    </Panel>
  );
}

function Panel({
  icon,
  color,
  title,
  sub,
  children,
}: {
  icon: IconName;
  color: 'green' | 'purple' | 'yellow' | 'red' | 'blue' | 'gray';
  title: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="panel" aria-label={title}>
      <div className="panel-head">
        <span className={`panel-icon ${color}`} aria-hidden="true"><Octicon name={icon} size={20} /></span>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
          {sub && <div className="muted">{sub}</div>}
        </div>
      </div>
      {children && <div className="panel-body">{children}</div>}
    </section>
  );
}

function RejectButton({ pending, onReject }: { pending: boolean; onReject: () => void }) {
  return (
    <ConfirmButton
      label="却下"
      className="btn-danger"
      title="この稟議を却下しますか？"
      confirmLabel="却下する"
      confirmClassName="btn-danger"
      disabled={pending}
      onConfirm={onReject}
    >
      <p>稟議はクローズされます。理由を伝えたい場合は、先にコメントを書いてください。</p>
    </ConfirmButton>
  );
}

function WithdrawButton({ pending, onWithdraw }: { pending: boolean; onWithdraw: () => void }) {
  return (
    <ConfirmButton
      label="取り下げ"
      className="btn-danger"
      title="この稟議を取り下げますか？"
      confirmLabel="取り下げる"
      confirmClassName="btn-danger"
      disabled={pending}
      onConfirm={onWithdraw}
    >
      <p>稟議はクローズされます。</p>
    </ConfirmButton>
  );
}
