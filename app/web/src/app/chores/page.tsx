import { apiFetch } from '@/lib/api';
import { requireUser } from '@/lib/session';
import Link from 'next/link';
import type { ChoresResp } from '@/lib/types';
import { CHORE_PERIOD_TABS, choreTimeTotalLabel, filterByPeriod, isChorePeriodTab } from '@/lib/format';
import Avatar from '@/components/Avatar';
import ChoreBadges from '@/components/ChoreBadges';
import ContributionGraph from '@/components/ContributionGraph';
import ChoreButton from './chore-button';
import PushButton from './push-button';

/** 家事のコミット。やった家事を記録し、連続記録・マークを付ける */
export default async function ChoresPage({ searchParams }: { searchParams: { period?: string } }) {
  const user = await requireUser();
  const d = await apiFetch<ChoresResp>('/chores');
  const active = d.chores.filter((c) => !c.archived);
  const doneToday = active.filter((c) => c.committed_today).length;
  // 推奨頻度 (毎日 / 週 / 月) で表示を切り替える。タブごとに、その家事をすべてクリアするとプッシュできる
  const period = isChorePeriodTab(searchParams.period) ? searchParams.period : 'all';
  const shown = filterByPeriod(active, period);
  const push = d.pushes.find((p) => p.scope === period);
  const totalLabel = choreTimeTotalLabel(shown, period);

  return (
    <div>
      <h1>マイページ <span className="ja">やった家事をコミットして、実績を残しましょう</span></h1>

      <div className="box">
        <div className="box-head">
          <h2>今日の家事 <span className="ja">{d.today}</span></h2>
          <span className="muted small">{doneToday} / {active.length} コミット済み</span>
        </div>
        <div className="box-body">
          {active.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>家事の項目がありません。{user.is_admin ? '設定画面で追加できます。' : '管理者に追加してもらいましょう。'}</p>
          ) : (
            <>
              <div className="chore-period-bar">
                <nav className="filters" aria-label="推奨頻度で切り替え">
                  {CHORE_PERIOD_TABS.map((t) => {
                    const p = d.pushes.find((x) => x.scope === t.key);
                    return (
                      <Link
                        key={t.key}
                        href={t.key === 'all' ? '/chores' : `/chores?period=${t.key}`}
                        className={t.key === period ? 'on' : ''}
                        aria-current={t.key === period ? 'page' : undefined}
                      >
                        {t.label} <span className="counter">{filterByPeriod(active, t.key).length}</span>
                        {/* 今の期間にプッシュ済みならトロフィーを出す */}
                        {p?.pushed && <span title={`${p.period}の「${p.trophy_label}」はプッシュ済み`}> {p.trophy_icon}</span>}
                      </Link>
                    );
                  })}
                </nav>
                {totalLabel && <span className="chore-total">{totalLabel}</span>}
              </div>
              {shown.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  この頻度の家事はありません。{user.is_admin ? '設定画面で家事ごとに推奨頻度を設定できます。' : ''}
                </p>
              ) : (
                <div className="chore-grid">
                  {shown.map((c) => <ChoreButton key={c.id} chore={c} linked />)}
                </div>
              )}
            </>
          )}
          {/* 表示中のタブの家事をすべてクリアしたときだけプッシュボタンを出す */}
          {push && push.total > 0 && !push.can_push && !push.pushed && (
            <p className="muted small" style={{ margin: '12px 0 0' }}>
              {push.trophy_icon} {push.period}のクリア: <strong>{push.done} / {push.total}</strong>件
              {push.scope === 'week' || push.scope === 'month' ? ' (推奨の回数ぶんコミットするとクリア)' : ''}
            </p>
          )}
          {push?.can_push && <PushButton status={push} />}
          {push?.pushed && (
            <div className="push-panel pushed" role="status">
              <span className="push-trophy" aria-hidden="true">{push.trophy_icon}</span>
              <div>
                <strong>{push.period}の「{push.label}」はプッシュ済みです。「{push.trophy_label}」トロフィーを獲得しました！</strong>
                <div className="muted small">
                  これまでのトロフィー: {d.me.trophy_counts.find((t) => t.scope === push.scope)?.count ?? 0}個 (全種類で{d.me.trophies}個)
                </div>
              </div>
            </div>
          )}
          <p className="muted small" style={{ margin: '12px 0 0' }}>
            1つの家事は1日1回コミットできます (プッシュするまでは、その日のうちなら取り消せます)。タブごとに家事をすべてクリアするとプッシュでき、トロフィーが残ります
            (すべて 🏆 = 今日すべて、毎日 🥉 = 毎日の家事を今日、週 🥈 = 週の家事を今週、月 🥇 = 月の家事を今月、それぞれ推奨の回数ぶん)。家事の名前を押すと、きれいな状態の見本を確認できます。稟議のレビューでは、申請者の家事の実績がレビュアーに表示されます。
          </p>
        </div>
      </div>

      <div className="box">
        <div className="box-head"><h2>あなたの実績</h2></div>
        <div className="box-body">
          <ContributionGraph days={d.me.calendar} />
          <ChoreBadges c={d.me} />
          {d.me.by_chore.length > 0 && (
            <div className="chips" style={{ marginTop: 12 }}>
              {d.me.by_chore.map((s) => (
                <span key={s.chore_id} className="label label-muted">
                  {s.icon} {s.name} {s.days}日{s.current_streak > 0 && ` · 🔥${s.current_streak}`}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="box">
        <div className="box-head"><h2>家族の実績</h2></div>
        {d.members.map((m) => (
          <div key={m.user.id} className="box-row chore-member">
            <div className="person" style={{ minWidth: 140 }}>
              <Avatar name={m.user.name} large />
              <strong>{m.user.name}</strong>
              {m.user.id === user.id && <span className="muted"> (あなた)</span>}
            </div>
            <ContributionGraph days={m.summary.calendar} small />
            <ChoreBadges c={m.summary} compact />
          </div>
        ))}
      </div>
    </div>
  );
}
