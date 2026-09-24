import { Text, View } from 'react-native';
import { C, s } from '@/components/ui';
import type { ContributionDay, ContributionSummary } from '@/types';

// Web (ContributionGraph.tsx) と同じ草の濃さ
const LEVEL = ['#eff2f5', '#aceebb', '#4ac26b', '#2da44e', '#116329'];

/** GitHub 風の草グラフ。列 = 週 (日曜始まり)、行 = 曜日 */
export function ContributionGraph({ days, cell = 10 }: { days: ContributionDay[]; cell?: number }) {
  const weeks: ContributionDay[][] = [];
  days.forEach((d, i) => {
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(d);
  });
  return (
    <View style={{ flexDirection: 'row', gap: 2 }} accessibilityLabel={`直近${weeks.length}週間で${days.filter((d) => d.count > 0).length}日コミット`}>
      {weeks.map((w) => (
        <View key={w[0].date} style={{ gap: 2 }}>
          {w.map((d) => (
            <View
              key={d.date}
              style={{
                width: cell, height: cell, borderRadius: 2, backgroundColor: LEVEL[Math.min(d.count, 4)],
                // プッシュした日は金色の枠
                ...(d.pushed ? { borderWidth: 2, borderColor: '#d4a72c' } : {}),
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/** 連続日数・直近 30 日などの数字とマーク */
export function ChoreBadges({ c, compact }: { c: ContributionSummary; compact?: boolean }) {
  return (
    <View style={{ marginTop: 8, gap: 6 }}>
      <Text style={{ color: C.fg }}>
        <Text style={{ fontWeight: '700', fontSize: 16, color: c.trophies > 0 ? C.yellow : C.fg }}>🏆 {c.trophies}</Text>個
        {c.trophy_counts.length > 0 && (
          <Text style={s.muted}> ({c.trophy_counts.map((t) => `${t.icon}${t.count}`).join(' ')})</Text>
        )}{'   '}
        <Text style={{ fontWeight: '700', fontSize: 16, color: c.current_streak > 0 ? '#bc4c00' : C.fg }}>🔥 {c.current_streak}</Text>日連続
        {'   '}<Text style={{ fontWeight: '700', fontSize: 16 }}>{c.last_30_days}</Text>日<Text style={s.muted}> / 直近30日</Text>
        {!compact && (
          <>
            {'   '}<Text style={{ fontWeight: '700', fontSize: 16 }}>{c.longest_streak}</Text>日<Text style={s.muted}> 最長</Text>
            {'   '}<Text style={{ fontWeight: '700', fontSize: 16 }}>{c.total_days}</Text>日<Text style={s.muted}> 累計</Text>
          </>
        )}
      </Text>
      {c.badges.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {c.badges.map((b) => (
            <Text key={b.key} style={{ backgroundColor: '#fff8c5', color: C.yellow, borderColor: '#d4a72c66', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1, fontSize: 12, overflow: 'hidden' }}>
              {b.icon} {b.label}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={[s.muted, { fontSize: 12 }]}>まだマークはありません</Text>
      )}
    </View>
  );
}
