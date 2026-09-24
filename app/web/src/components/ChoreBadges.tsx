import type { ContributionSummary } from '@/lib/types';

/**
 * 家事の実績の数字 (連続・最長・直近 30 日・累計) とマーク。
 * 数字を別に出している画面 (ダッシュボード) では numbers={false} でマークだけにする。
 */
export default function ChoreBadges({ c, compact, numbers = true }: { c: ContributionSummary; compact?: boolean; numbers?: boolean }) {
  return (
    <div className="chore-summary">
      {numbers && <div className="chore-numbers">
        <span title="プッシュして取ったトロフィー (取り消せない実績)">
          トロフィー <strong className={c.trophies > 0 ? 'trophy-on' : undefined}>{c.trophies}</strong>個
          {c.trophy_counts.length > 0 && (
            <span className="muted">
              {' ('}
              {c.trophy_counts.map((t, i) => (
                <span key={t.scope} title={`${t.label}: ${t.count}個`}>{i > 0 && ' '}{t.icon}{t.count}</span>
              ))}
              {')'}
            </span>
          )}
        </span>
        <span title="今日 (まだなら昨日) まで続いている連続日数">
          <strong className={c.current_streak > 0 ? 'streak-on' : undefined}>🔥 {c.current_streak}</strong>日連続
        </span>
        <span><strong>{c.last_30_days}</strong>日 <span className="muted">/ 直近30日</span></span>
        {!compact && (
          <>
            <span><strong>{c.longest_streak}</strong>日 <span className="muted">最長連続</span></span>
            <span><strong>{c.total_days}</strong>日 <span className="muted">累計</span></span>
          </>
        )}
      </div>}
      {c.badges.length > 0 ? (
        <div className="chore-badges">
          {c.badges.map((b) => (
            <span key={b.key} className="chore-badge" title={b.label}>
              <span aria-hidden="true">{b.icon}</span> {b.label}
            </span>
          ))}
        </div>
      ) : (
        <p className="muted small" style={{ margin: '4px 0 0' }}>まだマークはありません</p>
      )}
    </div>
  );
}
