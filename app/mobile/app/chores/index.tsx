import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { apiFetch, choreImageUrl, getToken } from '@/api';
import { Avatar, Button, C, Card, s } from '@/components/ui';
import { ChoreBadges, ContributionGraph } from '@/components/Contributions';
import { CHORE_PERIOD_TABS, choreScheduleLabel, choreTimeTotalLabel, filterByPeriod, periodProgressLabel, type ChorePeriodTab } from '@/format';
import type { ChoresResp, ChoreStatus, PushStatus } from '@/types';

type Filter = 'todo' | 'done' | 'all';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'todo', label: 'まだ' },
  { key: 'done', label: '済み' },
  { key: 'all', label: 'すべて' },
];
/** 家事がこの数より多いときだけ検索欄を出す */
const SEARCH_FROM = 6;

/** プッシュの対象の呼び方 (例: 今日の家事 / 週の家事) */
const pushWhat = (p: PushStatus) => (p.scope === 'all' ? '今日の家事' : `${p.label}の家事`);

/** 家事のコミット (Web の /chores と同じ内容。項目の管理は Web の設定画面で行う) */
export default function ChoresScreen() {
  const [d, setD] = useState<ChoresResp | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  // 最初は「まだ」を表示して、自分がこれからコミットする家事を見つけやすくする
  const [filter, setFilter] = useState<Filter>('todo');
  // 推奨頻度 (毎日 / 週 / 月) で表示を切り替える。タブごとに、その家事をすべてクリアするとプッシュできる
  const [period, setPeriod] = useState<ChorePeriodTab>('all');
  const [query, setQuery] = useState('');

  useFocusEffect(useCallback(() => {
    getToken().then(setToken);
    apiFetch<ChoresResp>('/chores').then(setD).catch((e) => Alert.alert('読み込めませんでした', (e as Error).message));
  }, []));

  if (!d) return <View style={s.center}><ActivityIndicator /></View>;
  const active = d.chores.filter((c) => !c.archived);
  const done = active.filter((c) => c.committed_today);
  const remaining = active.filter((c) => !c.committed_today);
  const inPeriod = filterByPeriod(active, period);
  const q = query.trim();
  const shown = inPeriod
    .filter((c) => (filter === 'todo' ? !c.committed_today : filter === 'done' ? c.committed_today : true))
    .filter((c) => !q || c.name.includes(q) || c.description.includes(q));
  const totalLabel = choreTimeTotalLabel(inPeriod, period);
  const pushSt = d.pushes.find((p) => p.scope === period);

  const toggle = async (c: ChoreStatus) => {
    setBusy(c.id);
    try {
      setD(await apiFetch<ChoresResp>(`/chores/${c.id}/commit`, { method: c.committed_today ? 'DELETE' : 'POST' }));
    } catch (e) {
      Alert.alert('更新できませんでした', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /** 押し間違いで取り消さないよう、取り消しは確認してから行う */
  const undo = (c: ChoreStatus) =>
    Alert.alert(`${c.name}のコミットを取り消しますか？`, undefined, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '取り消す', style: 'destructive', onPress: () => toggle(c) },
    ]);

  /** 種類 (すべて / 毎日 / 週 / 月) の家事をすべてクリアしたらプッシュしてトロフィーを取る (取り消せない) */
  const push = (p: PushStatus) =>
    Alert.alert(`${pushWhat(p)}をプッシュしますか？`, `「${p.trophy_label}」トロフィー ${p.trophy_icon} を獲得し、消えない実績として残ります。プッシュした後は、対象の家事の今日のコミットを取り消せなくなります。`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'プッシュする',
        onPress: async () => {
          setBusy('push');
          try {
            setD(await apiFetch<ChoresResp>('/chores/push', { method: 'POST', body: JSON.stringify({ scope: p.scope }) }));
          } catch (e) {
            Alert.alert('プッシュできませんでした', (e as Error).message);
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 12, paddingBottom: 48 }}>
      <Card title={`今日の家事 (${d.today})`}>
        {active.length > 0 && (
          <>
            {/* 進み具合 */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontWeight: '600', color: C.fg }}>{done.length} / {active.length} コミット済み</Text>
              {remaining.length > 0 && <Text style={s.muted}>あと {remaining.length}件</Text>}
            </View>
            <View style={{ height: 6, backgroundColor: '#eff2f5', borderRadius: 3, marginBottom: 10 }}>
              <View style={{ height: 6, width: `${(done.length / active.length) * 100}%`, backgroundColor: C.green, borderRadius: 3 }} />
            </View>

            {/* 推奨頻度のタブ (件数付き) と、表示中の家事の合計所要時間 */}
            <View style={{ flexDirection: 'row', borderBottomColor: C.borderMuted, borderBottomWidth: 1, marginBottom: 6 }}>
              {CHORE_PERIOD_TABS.map((t) => {
                const on = t.key === period;
                const p = d.pushes.find((x) => x.scope === t.key);
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => setPeriod(t.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderBottomWidth: 2, borderBottomColor: on ? '#fd8c73' : 'transparent' }}
                  >
                    <Text style={{ fontSize: 13, color: on ? C.fg : C.muted, fontWeight: on ? '700' : '400' }}>
                      {t.label} {filterByPeriod(active, t.key).length}{p?.pushed ? ` ${p.trophy_icon}` : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {!!totalLabel && <Text style={{ fontSize: 12, color: C.fg, marginBottom: 8 }}>{totalLabel}</Text>}

            {/* 絞り込み: 自分がまだコミットしていない家事を探しやすくする */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
              {FILTERS.map((f) => (
                <Pressable
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  style={[s.chip, { paddingVertical: 5, paddingHorizontal: 10 }, filter === f.key && s.chipOn]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: filter === f.key }}
                >
                  <Text style={[s.chipText, filter === f.key && s.chipTextOn]}>
                    {f.label} {inPeriod.filter((c) => (f.key === 'todo' ? !c.committed_today : f.key === 'done' ? c.committed_today : true)).length}
                  </Text>
                </Pressable>
              ))}
            </View>
            {active.length > SEARCH_FROM && (
              <TextInput
                style={[s.input, { paddingVertical: 7, fontSize: 14, marginBottom: 8 }]}
                value={query}
                onChangeText={setQuery}
                placeholder="家事の名前で探す"
                clearButtonMode="while-editing"
                accessibilityLabel="家事の名前で探す"
              />
            )}

            {shown.length === 0 && (
              <Text style={[s.muted, { paddingVertical: 12, textAlign: 'center' }]}>
                {inPeriod.length === 0
                  ? 'この頻度の家事はありません (推奨頻度は Web の設定画面で設定できます)'
                  : filter === 'todo' && !query
                    ? `🎉 ${period === 'all' ? '今日の家事' : 'この頻度の家事'}はすべてコミットしました`
                    : '該当する家事はありません'}
              </Text>
            )}
            {shown.map((c) => {
              const meta = [
                choreScheduleLabel(c),
                periodProgressLabel(c),
                c.current_streak > 0 ? `🔥${c.current_streak}日連続` : null,
                `累計${c.days}日`,
              ].filter(Boolean).join(' · ');
              const locked = c.locked;
              return (
                <View
                  key={c.id}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8,
                    borderRadius: 6, marginBottom: 4,
                    backgroundColor: c.committed_today ? '#dafbe1' : 'transparent',
                  }}
                >
                  {/* 名前・画像を押すと、きれいな状態の見本を確認できる */}
                  <Pressable
                    onPress={() => router.push(`/chores/${c.id}`)}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                    accessibilityLabel={`${c.name}の見本と説明を見る`}
                  >
                    {c.images[0] ? (
                      <Image
                        source={{ uri: choreImageUrl(c.images[0].id), headers: token ? { Authorization: `Bearer ${token}` } : undefined }}
                        style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: C.bg }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 22 }}>{c.icon}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '600', color: C.fg, fontSize: 15 }} numberOfLines={1}>
                        {c.images[0] ? `${c.icon} ` : ''}{c.name}
                      </Text>
                      <Text style={[s.muted, { fontSize: 12 }]} numberOfLines={1}>{meta}</Text>
                    </View>
                  </Pressable>
                  {/* プッシュした日のコミットは確定済みなので取り消せない */}
                  {locked ? (
                    <Text style={{ color: C.green, fontWeight: '600', fontSize: 13 }}>🏆 済み</Text>
                  ) : busy === c.id ? (
                    <ActivityIndicator style={{ width: 76 }} />
                  ) : c.committed_today ? (
                    <Pressable
                      onPress={() => undo(c)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`${c.name}のコミットを取り消す`}
                      style={{ borderWidth: 1, borderColor: '#4ac26b', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, minWidth: 76, alignItems: 'center' }}
                    >
                      <Text style={{ color: C.green, fontWeight: '600', fontSize: 13 }}>✓ 済み</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => toggle(c)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`${c.name}をコミット`}
                      style={({ pressed }) => ({ backgroundColor: C.green, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, minWidth: 76, alignItems: 'center', opacity: pressed ? 0.8 : 1 })}
                    >
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>コミット</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </>
        )}
        {active.length === 0 && <Text style={s.muted}>家事の項目がありません。Web の設定画面で追加できます。</Text>}
        {/* 表示中のタブの家事をすべてクリアしたときだけプッシュボタンを出す */}
        {pushSt && pushSt.total > 0 && !pushSt.can_push && !pushSt.pushed && (
          <Text style={[s.muted, { fontSize: 12, marginTop: 10 }]}>
            {pushSt.trophy_icon} {pushSt.period}のクリア: <Text style={{ fontWeight: '700', color: C.fg }}>{pushSt.done} / {pushSt.total}</Text>件
            {pushSt.scope === 'week' || pushSt.scope === 'month' ? ' (推奨の回数ぶんコミットするとクリア)' : ''}
          </Text>
        )}
        {pushSt?.can_push && (
          <View style={{ marginTop: 12, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#c297ff', backgroundColor: '#fbefff', gap: 8 }}>
            <Text style={{ fontWeight: '700', color: C.fg }}>{pushWhat(pushSt)}を{pushSt.total}件すべてクリアしました！</Text>
            <Text style={[s.muted, { fontSize: 12 }]}>プッシュすると、{pushSt.period}の「{pushSt.trophy_label}」トロフィー {pushSt.trophy_icon} が実績として残ります。</Text>
            <Button title="🚀 プッシュする" variant="merge" busy={busy === 'push'} onPress={() => push(pushSt)} />
          </View>
        )}
        {pushSt?.pushed && (
          <View style={{ marginTop: 12, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#d4a72c', backgroundColor: '#fff8c5', flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Text style={{ fontSize: 30 }}>{pushSt.trophy_icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: C.fg }}>{pushSt.period}の「{pushSt.label}」はプッシュ済みです。「{pushSt.trophy_label}」トロフィーを獲得しました！</Text>
              <Text style={[s.muted, { fontSize: 12 }]}>
                これまでのトロフィー: {d.me.trophy_counts.find((t) => t.scope === pushSt.scope)?.count ?? 0}個 (全種類で{d.me.trophies}個)
              </Text>
            </View>
          </View>
        )}
        <Text style={[s.muted, { fontSize: 12, marginTop: 10 }]}>
          1つの家事は1日1回コミットできます。家事の名前を押すと、説明ときれいな状態の見本を確認できます。タブごとに家事をすべてクリアするとプッシュでき、トロフィーが残ります (すべて 🏆 = 今日すべて、毎日 🥉 = 毎日の家事を今日、週 🥈 = 週の家事を今週、月 🥇 = 月の家事を今月、それぞれ推奨の回数ぶん)。
        </Text>
      </Card>

      <Card title="あなたの実績">
        <ContributionGraph days={d.me.calendar} />
        <ChoreBadges c={d.me} />
      </Card>

      <Card title="家族の実績">
        {d.members.map((m) => (
          <View key={m.user.id} style={{ paddingVertical: 10, borderBottomColor: C.borderMuted, borderBottomWidth: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Avatar name={m.user.name} />
              <Text style={{ fontWeight: '600' }}>{m.user.name}</Text>
            </View>
            <ContributionGraph days={m.summary.calendar} cell={8} />
            <ChoreBadges c={m.summary} compact />
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}
