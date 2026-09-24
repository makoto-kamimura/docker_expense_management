import Link from 'next/link';
import { getRequestOr404 } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { checkpoints, dateRange, fmtDateTime, money } from '@/lib/format';
import { DECISION_LABEL, KIND_TEXT } from '@/lib/types';
import StatusBadge from '@/components/StatusBadge';
import Attachments from '@/components/Attachments';
import LinkCard from '@/components/LinkCard';
import { previewImagePath } from '@/lib/types';
import SlideDeck from './slide-deck';



/** 申請内容を家族会議・印刷向けのスライドにまとめる */
export default async function SummaryPage({ params }: { params: { id: string } }) {
  await requireUser();
  const d = await getRequestOr404(params.id);
  const { request: r } = d;
  const t = KIND_TEXT[r.kind];
  const productPreview = r.product_url ? d.previews.find((pv) => pv.url === r.product_url) : undefined;
  const TITLES = ['表紙', t.reason, t.compare, '資料', '話し合い', '判定'];
  const checks = checkpoints(d);
  const comments = d.timeline.filter((e) => e.type === 'comment').slice(-4);
  const evidence = d.attachments.filter((a) => a.kind === 'evidence');

  return (
    <div>
      <div className="no-print" style={{ marginBottom: 12 }}>
        <Link href={`/requests/${r.id}`} className="small">← 稟議に戻る</Link>
      </div>
      <SlideDeck titles={TITLES}>
        <div className="slide-cover" style={productPreview?.has_image ? { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 38%', gap: 32, alignItems: 'center' } : undefined}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="eyebrow">{t.eyebrow} · {d.family_name}</div>
          <h1 className="slide-title">{r.title}</h1>
          <div className="cover-amount">{money(r.price, r.currency)}</div>
          <StatusBadge status={r.status} kind={r.kind} hint />
          <dl className="cover-meta">
            <div><dt>申請者</dt><dd>{d.requester.name}</dd></div>
            <div><dt>レビュアー</dt><dd>{d.reviewers.map((x) => x.name).join('、') || '—'}</dd></div>
            <div><dt>{t.product}</dt><dd>{r.product_name || '—'}</dd></div>
            <div><dt>{t.seller}</dt><dd>{r.seller || '—'}</dd></div>
            <div><dt>ラベル</dt><dd>{d.labels.map((l) => l.name).join('、') || '—'}</dd></div>
            <div><dt>申請日時</dt><dd>{fmtDateTime(r.submitted_at)}</dd></div>
            <div><dt>{t.hasEndDate ? '日程' : t.date}</dt><dd>{dateRange(r.planned_date, r.end_date)}</dd></div>
          </dl>
          </div>
          {productPreview?.has_image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewImagePath(productPreview.id)} alt="" style={{ width: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)' }} />
          )}
        </div>

        <div>
          <h2 className="slide-heading">{t.reason}</h2>
          <div className="slide-block">
            <p className="pre" style={{ fontSize: 18 }}>{r.reason || '—'}</p>
          </div>
          {r.notes && (
            <div className="slide-block" style={{ marginTop: 16 }}>
              <h3>メモ</h3>
              <p className="pre">{r.notes}</p>
            </div>
          )}
        </div>

        <div>
          <h2 className="slide-heading">{t.compare}</h2>
          {r.product_url && <LinkCard url={r.product_url} preview={productPreview} />}
          <div className="table-wrap">
            <table className="slide-table">
              <thead><tr><th>{t.product}</th><th>{t.seller} / メモ</th><th className="right">{t.priceShort}</th><th>URL</th></tr></thead>
              <tbody>
                <tr className="current">
                  <td>{r.product_name ?? r.title} <span className="label">この稟議</span></td>
                  <td>{r.seller || '—'}</td>
                  <td className="right">{money(r.price, r.currency)}</td>
                  <td>{r.product_url ? <a href={r.product_url} target="_blank" rel="noopener noreferrer">開く</a> : '—'}</td>
                </tr>
                {d.alternatives.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td className="muted">{a.notes ?? ''}</td>
                    <td className="right">{money(a.price, r.currency)}</td>
                    <td>{a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer">開く</a> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {d.alternatives.length === 0 && <p className="muted" style={{ marginTop: 12 }}>{t.noAlternatives}。</p>}
        </div>

        <div>
          <h2 className="slide-heading">資料</h2>
          {evidence.length === 0 ? <p className="muted">添付された資料はありません。</p> : <Attachments files={evidence} requestId={r.id} />}
        </div>

        <div>
          <h2 className="slide-heading">話し合い</h2>
          <div className="slide-cols">
            <div className="slide-block">
              <h3>最近のコメント</h3>
              {comments.length === 0 && <p className="muted">コメントはまだありません。</p>}
              {comments.map((c) =>
                c.type === 'comment' ? (
                  <p key={c.id} style={{ marginBottom: 12 }}>
                    <strong>{c.user?.name ?? '—'}</strong>
                    <br />
                    <span className="pre">{c.body}</span>
                  </p>
                ) : null,
              )}
            </div>
            <div className="slide-block">
              <h3>レビューのチェックポイント</h3>
              <ul className="checklist">
                {checks.map((c) => (
                  <li key={c.label} className={c.ok ? 'ok' : 'warn'}>
                    <span aria-hidden="true">{c.ok ? '✓' : '!'}</span>
                    {c.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div>
          <h2 className="slide-heading">判定</h2>
          <StatusBadge status={r.status} kind={r.kind} hint />
          <dl className="cover-meta">
            {d.reviewers.map((x) => (
              <div key={x.id}><dt>{x.name}</dt><dd>{DECISION_LABEL[x.decision]}</dd></div>
            ))}
            {d.merged_by && <div><dt>マージした人</dt><dd>{d.merged_by.name} · {fmtDateTime(r.merged_at)}</dd></div>}
            {r.status === 'purchased' && (
              <div><dt>{t.actualPrice}</dt><dd>{money(r.actual_price, r.currency)} · {r.purchase_date}</dd></div>
            )}
          </dl>
        </div>
      </SlideDeck>
    </div>
  );
}
