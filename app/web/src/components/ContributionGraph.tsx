import type { ContributionDay } from '@/lib/types';

/** その日の件数 (やった家事の数) を草の濃さ 0〜4 にする */
function level(count: number): number {
  return Math.min(count, 4);
}

/**
 * GitHub の Contribution グラフ風の草。列 = 週 (日曜始まり)、行 = 曜日。
 * API の calendar は日曜から今日まで並んでいるので、そのまま縦に流し込む。
 */
export default function ContributionGraph({ days, small }: { days: ContributionDay[]; small?: boolean }) {
  const total = days.filter((d) => d.count > 0).length;
  return (
    <div className={`contrib${small ? ' contrib-sm' : ''}`}>
      <div className="contrib-grid" role="img" aria-label={`直近${Math.ceil(days.length / 7)}週間で${total}日コミット`}>
        {days.map((d) => (
          <span
            key={d.date}
            className={`contrib-cell l${level(d.count)}${d.pushed ? ' pushed' : ''}`}
            title={`${d.date}: ${d.count ? `${d.count}件` : 'なし'}${d.pushed ? ' · 🏆 プッシュ' : ''}`}
          />
        ))}
      </div>
      {!small && (
        <div className="contrib-legend muted small" aria-hidden="true">
          少ない
          {[0, 1, 2, 3, 4].map((l) => <span key={l} className={`contrib-cell l${l}`} />)}
          多い
          <span className="contrib-cell l2 pushed" style={{ marginLeft: 8 }} /> プッシュした日
        </div>
      )}
    </div>
  );
}
