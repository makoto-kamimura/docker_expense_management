import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { apiFetch } from '@/api';
import { money } from '@/format';
import { C, Card, s } from '@/components/ui';
import { ChoreBadges, ContributionGraph } from '@/components/Contributions';
import type { ChoresResp, Dashboard } from '@/types';
import { LabelChip } from '@/components/Labels';

export default function DashboardScreen() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [chores, setChores] = useState<ChoresResp | null>(null);
  useFocusEffect(useCallback(() => {
    Promise.all([apiFetch<Dashboard>('/dashboard'), apiFetch<ChoresResp>('/chores')])
      .then(([dash, ch]) => { setD(dash); setChores(ch); })
      .catch((e) => Alert.alert('読み込めませんでした', (e as Error).message));
  }, []));
  if (!d || !chores) return <View style={s.center}><ActivityIndicator /></View>;
  const me = chores.me;
  const choreMax = Math.max(1, ...me.by_chore.map((c) => c.days));
  const max = Math.max(1, ...d.by_label.map((c) => c.total));
  const stats: [string, string | number][] = [
    ['稟議の数', d.total_requests],
    ['レビュー待ち', d.waiting_for_review],
    ['自分のレビュー待ち', d.waiting_for_my_review],
    ['承認済み', d.approved],
    ['完了', d.purchased],
    ['支出の合計', money(d.total_spending, d.currency)],
  ];

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {stats.map(([k, v]) => (
          <View key={k} style={{ width: '48.5%', backgroundColor: '#fff', borderColor: C.border, borderWidth: 1, borderRadius: 8, padding: 12 }}>
            <Text style={[s.muted, { fontWeight: '600', fontSize: 12 }]}>{k}</Text>
            <Text style={{ fontSize: 22, fontWeight: '600', color: C.fg }}>{v}</Text>
          </View>
        ))}
      </View>
      <Card
        title="あなたの家事の実績"
        right={<Text style={s.link} onPress={() => router.push('/chores')}>マイページ</Text>}
      >
        <Text style={{ marginBottom: 8, color: C.fg }}>
          今日: <Text style={{ fontWeight: '700', color: me.committed_today ? C.green : C.muted }}>{me.pushed_today ? '🏆 プッシュ済み' : me.committed_today ? 'コミット済み' : 'まだ'}</Text>
        </Text>
        <ContributionGraph days={me.calendar} cell={9} />
        <ChoreBadges c={me} />
        <Text style={{ fontWeight: '600', marginTop: 12, marginBottom: 6, color: C.fg }}>家事ごとの日数</Text>
        {me.by_chore.length === 0 && <Text style={s.muted}>まだコミットした家事はありません。</Text>}
        {me.by_chore.map((c) => (
          <View key={c.chore_id} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text>{c.icon} {c.name}</Text>
              <Text style={{ fontWeight: '600' }}>{c.days}日{c.current_streak > 0 && <Text style={s.muted}> (🔥{c.current_streak})</Text>}</Text>
            </View>
            <View style={{ height: 8, backgroundColor: '#eff2f5', borderRadius: 4, marginTop: 4 }}>
              <View style={{ height: 8, width: `${(c.days / choreMax) * 100}%`, backgroundColor: C.green, borderRadius: 4 }} />
            </View>
          </View>
        ))}
      </Card>

      <Card title="ラベル別の支出">
        <Text style={[s.muted, { fontSize: 12, marginBottom: 8 }]}>複数のラベルが付いた稟議は、それぞれのラベルに数えます。</Text>
        {d.by_label.length === 0 && <Text style={s.muted}>まだ完了した稟議はありません。</Text>}
        {d.by_label.map((c) => (
          <View key={c.label?.id ?? 'none'} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              {c.label ? <LabelChip label={c.label} /> : <Text style={s.muted}>ラベルなし</Text>}
              <Text style={{ fontWeight: '600' }}>{money(c.total, d.currency)} <Text style={s.muted}>({c.count}件)</Text></Text>
            </View>
            <View style={{ height: 8, backgroundColor: '#eff2f5', borderRadius: 4, marginTop: 4 }}>
              <View style={{ height: 8, width: `${(c.total / max) * 100}%`, backgroundColor: C.purple, borderRadius: 4 }} />
            </View>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}
