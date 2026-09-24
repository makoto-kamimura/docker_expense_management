import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { money } from '@/lib/format';
import type { ChoresResp, Dashboard } from '@/lib/types';
import LabelChip from '@/components/LabelChip';
import ChoreBadges from '@/components/ChoreBadges';
import ContributionGraph from '@/components/ContributionGraph';

export default async function DashboardPage() {
  const user = await requireUser();
  const [d, chores] = await Promise.all([apiFetch<Dashboard>('/dashboard'), apiFetch<ChoresResp>('/chores')]);
  const max = Math.max(1, ...d.by_label.map((c) => c.total));
  const me = chores.me;
  const choreMax = Math.max(1, ...me.by_chore.map((c) => c.days));

  return (
    <div>
      <h1>ダッシュボード <span className="ja">家庭内の購入状況</span></h1>
      <div className="stats">
        <Stat k="稟議の数" v={d.total_requests} href="/" />
        <Stat k="レビュー待ち" v={d.waiting_for_review} href="/?filter=waiting" />
        <Stat k="自分のレビュー待ち" v={d.waiting_for_my_review} href="/?filter=to_review" />
        <Stat k="承認済み (購入前)" v={d.approved} href="/?filter=approved" />
        <Stat k="完了 (購入・お出かけ)" v={d.purchased} href="/?filter=purchased" />
        <Stat k="支出の合計" v={money(d.total_spending, d.currency)} />
      </div>

      <div className="box">
        <div className="box-head">
          <h2>{user.name}さんの家事の実績 <span className="ja">コミットした日数</span></h2>
          <Link href="/chores" className="small">マイページでコミットする</Link>
        </div>
        <div className="box-body">
          <div className="stats" style={{ marginBottom: 16 }}>
            <Stat k="今日" v={me.pushed_today ? 'プッシュ済み' : me.committed_today ? 'コミット済み' : 'まだ'} />
            <Stat k="トロフィー" v={`🏆 ${me.trophies}個`} />
            <Stat k="連続日数" v={`🔥 ${me.current_streak}日`} />
            <Stat k="最長の連続" v={`${me.longest_streak}日`} />
            <Stat k="直近30日" v={`${me.last_30_days}日`} />
            <Stat k="累計" v={`${me.total_days}日`} sub={`${me.total_commits}回`} />
          </div>
          <ContributionGraph days={me.calendar} />
          <ChoreBadges c={me} numbers={false} />
          <h3 className="dash-sub">家事ごとの日数</h3>
          {me.by_chore.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>まだコミットした家事はありません。</p>
          ) : (
            <table>
              <tbody>
                {me.by_chore.map((c) => (
                  <tr key={c.chore_id}>
                    <td style={{ width: 180 }}><Link href={`/chores/${c.chore_id}`} style={{ color: 'inherit' }}>{c.icon} {c.name}</Link></td>
                    <td>
                      <div className="bar" role="img" aria-label={`${c.days}日`}>
                        <span style={{ width: `${(c.days / choreMax) * 100}%` }} />
                      </div>
                    </td>
                    <td className="right" style={{ width: 160, fontVariantNumeric: 'tabular-nums' }}>
                      <strong>{c.days}日</strong>
                      {c.current_streak > 0 && <span className="muted small"> (🔥{c.current_streak}日連続)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="box">
        <div className="box-head">
          <h2>ラベル別の支出 <span className="ja">完了した稟議</span></h2>
          <span className="muted small">複数のラベルが付いた稟議は、それぞれのラベルに数えます</span>
        </div>
        <div className="box-body">
          {d.by_label.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>まだ完了した稟議はありません。</p>
          ) : (
            <table>
              <tbody>
                {d.by_label.map((c) => (
                  <tr key={c.label?.id ?? 'none'}>
                    <td style={{ width: 160 }}>
                      {c.label ? <LabelChip label={c.label} href={`/?label=${c.label.id}`} /> : <span className="muted">ラベルなし</span>}
                    </td>
                    <td>
                      <div className="bar" role="img" aria-label={`${Math.round((c.total / max) * 100)}%`}>
                        <span style={{ width: `${(c.total / max) * 100}%` }} />
                      </div>
                    </td>
                    <td className="right" style={{ width: 160, fontVariantNumeric: 'tabular-nums' }}>
                      <strong>{money(c.total, d.currency)}</strong> <span className="muted small">({c.count}件)</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v, href, sub }: { k: string; v: number | string; href?: string; sub?: string }) {
  const body = (
    <>
      <div className="k">{k}</div>
      <div className="v">{v}{sub && <span className="muted small"> {sub}</span>}</div>
    </>
  );
  return href ? (
    <Link href={href} className="stat" style={{ color: 'inherit', textDecoration: 'none' }}>{body}</Link>
  ) : (
    <div className="stat">{body}</div>
  );
}
