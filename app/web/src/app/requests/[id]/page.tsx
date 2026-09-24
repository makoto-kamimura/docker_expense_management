import Link from 'next/link';
import { apiFetch, getRequestOr404 } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { checkpoints, dateRange, fmtDateTime, hostOf, money } from '@/lib/format';
import { DECISION_LABEL, KIND_LABEL, KIND_TEXT, STATUS_GROUP, statusLabel, type Label, type RequestRef, type ReviewerDecision } from '@/lib/types';
import LabelChip from '@/components/LabelChip';
import LabelPicker from '@/components/LabelPicker';
import Avatar from '@/components/Avatar';
import Attachments from '@/components/Attachments';
import AttachmentUpload from '@/components/AttachmentUpload';
import Timeline from '@/components/Timeline';
import CommentForm from '@/components/CommentForm';
import StatusPanel from '@/components/StatusPanel';
import Octicon, { statusIcon, type IconName } from '@/components/Octicon';
import RequestHeader from '@/components/RequestHeader';
import RequestTabs from '@/components/RequestTabs';
import LinkCard, { Thumb } from '@/components/LinkCard';
import ChoreBadges from '@/components/ChoreBadges';
import ContributionGraph from '@/components/ContributionGraph';

const DECISION_ICON: Record<ReviewerDecision, IconName> = {
  pending: 'dot',
  approved: 'check',
  changes_requested: 'redo',
  rejected: 'x',
};

/** 分岐元・分岐先の 1 行 */
function RefRow({ r }: { r: RequestRef }) {
  return (
    <div className="person" style={{ alignItems: 'flex-start', fontWeight: 400 }}>
      <span className={`icon-${STATUS_GROUP[r.status]}`} title={statusLabel(r.kind, r.status)} style={{ marginTop: 1 }}>
        <Octicon name={statusIcon(r.status)} size={14} />
      </span>
      <span>
        <Link href={`/requests/${r.id}`} style={{ fontWeight: 600 }}>{KIND_TEXT[r.kind].icon} {r.title}</Link>
        <br />
        <span className="muted">#{r.id.slice(0, 7)} · {r.requester_name} · {statusLabel(r.kind, r.status)}</span>
      </span>
    </div>
  );
}

export default async function RequestDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const d = await getRequestOr404(params.id);
  const { request: r, permissions: p } = d;
  // ラベルを付け外しできる人にだけ、家族のラベルの一覧を取る
  const allLabels = p.can_label ? await apiFetch<Label[]>('/labels') : [];
  const evidence = d.attachments.filter((a) => a.kind === 'evidence');
  const receipts = d.attachments.filter((a) => a.kind === 'receipt');
  const t = KIND_TEXT[r.kind];
  const preview = (url: string | null) => (url ? d.previews.find((pv) => pv.url === url) : undefined);

  return (
    <div>
      <RequestHeader d={d} canRequest={user.can_request} />
      <RequestTabs id={r.id} active="conversation" d={d} />

      <div className="detail-grid">
        <div>
          {/* 本文 (PR の説明欄に相当) */}
          <div className="indent">
          <div className="tl-comment" style={{ marginTop: 0 }}>
            <Avatar name={d.requester.name} large />
            <div className="box">
              <div className="box-head">
                <span><strong>{d.requester.name}</strong> <span className="muted">の{t.reason}</span></span>
                <span className="label label-muted">申請者</span>
              </div>
              <div className="box-body pre">{r.reason || <span className="muted">{t.reason}はまだ書かれていません。</span>}</div>
            </div>
          </div>
          </div>

          <section className="box indent">
            <div className="box-head">
              <h2>{t.section}</h2>
              {r.product_url && (
                <a className="btn btn-sm" href={r.product_url} target="_blank" rel="noopener noreferrer">{t.sectionLink}</a>
              )}
            </div>
            <div className="box-body">
              {r.product_url && <LinkCard url={r.product_url} preview={preview(r.product_url)} />}
              <dl className="facts">
                <dt>{t.product}</dt><dd>{r.product_name ?? '—'}</dd>
                <dt>{t.seller}</dt><dd>{r.seller || '—'}</dd>
                <dt>{t.priceShort}</dt><dd><strong>{money(r.price, r.currency)}</strong></dd>
                <dt>{t.productUrl}</dt>
                <dd>{r.product_url ? <a href={r.product_url} target="_blank" rel="noopener noreferrer">{hostOf(r.product_url)}</a> : '—'}</dd>
                <dt>{t.hasEndDate ? '日程' : t.date}</dt><dd>{dateRange(r.planned_date, r.end_date)}</dd>
                {r.notes && (<><dt>メモ</dt><dd className="pre">{r.notes}</dd></>)}
              </dl>
            </div>
          </section>

          <section className="box indent">
            <div className="box-head"><h2>{t.alternatives}</h2></div>
            {d.alternatives.length === 0 ? (
              <div className="box-body muted">{t.noAlternatives}。</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{t.altName}</th><th className="right">{t.priceShort}</th><th>URL</th><th>メモ</th></tr></thead>
                  <tbody>
                    <tr className="current">
                      <td>
                        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                          {preview(r.product_url)?.has_image && <Thumb id={preview(r.product_url)!.id} size={32} />}
                          {r.product_name ?? r.title} <span className="label">この稟議</span>
                        </span>
                      </td>
                      <td className="right">{money(r.price, r.currency)}</td>
                      <td>{r.product_url ? <a href={r.product_url} target="_blank" rel="noopener noreferrer">開く</a> : '—'}</td>
                      <td />
                    </tr>
                    {d.alternatives.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                            {preview(a.url)?.has_image && <Thumb id={preview(a.url)!.id} size={32} />}
                            <span>{a.name}{a.price != null && a.price < r.price && <> <span className="label label-muted">より安い</span></>}</span>
                          </span>
                        </td>
                        <td className="right">{money(a.price, r.currency)}</td>
                        <td>{a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer">開く</a> : '—'}</td>
                        <td className="muted">{a.notes ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="box indent">
            <div className="box-head"><h2>資料</h2><span className="counter">{evidence.length}</span></div>
            <div className="box-body">
              {evidence.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>添付された資料はありません。</p>
              ) : (
                <Attachments files={evidence} requestId={r.id} canDelete={p.can_upload_evidence} />
              )}
              {p.can_upload_evidence && <AttachmentUpload requestId={r.id} kind="evidence" label="資料を添付" />}
            </div>
          </section>

          {receipts.length > 0 && (
            <section className="box indent">
              <div className="box-head"><h2>{t.receipt}</h2><span className="counter">{receipts.length}</span></div>
              <div className="box-body">
                <Attachments files={receipts} requestId={r.id} canDelete={p.can_upload_receipt && r.status !== 'purchased'} />
              </div>
            </section>
          )}

          <Timeline entries={d.timeline} requesterId={r.requester_id} meId={user.id} kind={r.kind} />
          <StatusPanel detail={d} meId={user.id} />
          {p.can_comment && r.status !== 'draft' && (
            <div className="indent"><CommentForm requestId={r.id} meName={user.name} /></div>
          )}
        </div>

        <aside>
          <div className="side-section">
            <h3>レビュアー</h3>
            {d.reviewers.length === 0 && <p className="muted">まだいません</p>}
            {d.reviewers.map((x) => (
              <div key={x.id} className="person">
                <Avatar name={x.name} />
                <span>{x.name}</span>
                <span className={`decision decision-${x.decision}`} title={`${DECISION_LABEL[x.decision]} ${fmtDateTime(x.decided_at)}`}>
                  <Octicon name={DECISION_ICON[x.decision]} size={14} />
                  {DECISION_LABEL[x.decision]}
                </span>
              </div>
            ))}
          </div>
          <div className="side-section">
            <h3>申請者</h3>
            <div className="person"><Avatar name={d.requester.name} /><span>{d.requester.name}</span></div>
          </div>
          <div className="side-section">
            <h3>申請者の家事コミット</h3>
            <ContributionGraph days={d.requester_contributions.calendar} small />
            <ChoreBadges c={d.requester_contributions} compact />
            <p className="muted" style={{ marginTop: 6 }}>
              レビューの参考にしましょう。<Link href="/chores">家族の実績を見る</Link>
            </p>
          </div>
          <div className="side-section">
            <h3 className="side-head">
              <span>ラベル</span>
              {p.can_label && (
                <LabelPicker requestId={r.id} labels={allLabels} selected={d.labels.map((l) => l.id)} canManage={user.is_admin} />
              )}
            </h3>
            <div className="label-list">
              {d.labels.map((l) => <LabelChip key={l.id} label={l} href={`/?label=${l.id}`} />)}
              {r.kind !== 'purchase' && <span className="label label-outing">{t.icon} {KIND_LABEL[r.kind]}</span>}
              {d.labels.length === 0 && r.kind === 'purchase' && <span className="muted">なし</span>}
            </div>
          </div>
          {d.merged_by && (
            <div className="side-section">
              <h3>マージした人</h3>
              <div className="person"><Avatar name={d.merged_by.name} /><span>{d.merged_by.name}</span></div>
              <div className="muted">{fmtDateTime(r.merged_at)}</div>
            </div>
          )}
          <div className="side-section">
            <h3><span><Octicon name="branch" size={12} /> 分岐</span></h3>
            {d.parent && (
              <>
                <div className="muted" style={{ marginBottom: 2 }}>分岐元</div>
                <RefRow r={d.parent} />
              </>
            )}
            {d.children.length > 0 && (
              <>
                <div className="muted" style={{ margin: '8px 0 2px' }}>この稟議から分岐 ({d.children.length})</div>
                {d.children.map((c) => <RefRow key={c.id} r={c} />)}
              </>
            )}
            {!d.parent && d.children.length === 0 && <p className="muted">分岐はありません</p>}
            {user.can_request && (
              <Link className="btn btn-sm" href={`/requests/new?parent=${r.id}`} style={{ marginTop: 8 }}>
                <Octicon name="branch" /> この稟議から分岐
              </Link>
            )}
            <p className="muted" style={{ marginTop: 6 }}>「その後でやりたいこと」などを、この稟議に紐づけて作れます。</p>
          </div>
          <div className="side-section">
            <h3>レビューのチェックポイント</h3>
            <ul className="checklist">
              {checkpoints(d).map((c) => (
                <li key={c.label} className={c.ok ? 'ok' : 'warn'}>
                  <span aria-hidden="true">{c.ok ? '✓' : '!'}</span>
                  {c.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="side-section">
            <h3>まとめ資料</h3>
            <Link href={`/requests/${r.id}/summary`}>スライドで見る</Link>
            <p className="muted" style={{ marginTop: 4 }}>家族会議や印刷 (PDF) 用</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
