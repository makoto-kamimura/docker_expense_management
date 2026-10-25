import { useCallback, useState } from 'react';
import { Alert, Image, Pressable, RefreshControl, ScrollView, SectionList, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { apiFetch, clearToken, getToken, linkPreviewUrl } from '@/api';
import { money, timeAgo } from '@/format';
import { Button, C, s, StatusBadge, statusColor, toneColor } from '@/components/ui';
import { NotificationButton } from '@/components/NotificationButton';
import { DEFAULT_TURN, FILTER_STEPS, STATUS_FILTERS, TURN_FILTERS, statusLabel, typeOf, type LinkedRequest, type Me, type RequestCounts, type RequestListItem, type RequestType, type StatusFilterKey, type TurnKey, type FilterTone } from '@/types';
import { useTheme } from '@/theme';

/** トップ: 申請一覧 + フィルター (readme.md 8.6節) */
export default function RequestsScreen() {
  useTheme();
  const [items, setItems] = useState<RequestListItem[]>([]);
  // 段 (null = 全段) と番。開いたときは全段の自分の番
  const [status, setStatus] = useState<StatusFilterKey | null>(null);
  const [turn, setTurn] = useState<TurnKey>(DEFAULT_TURN);
  // 種類で絞り込む (種類の ID)
  const [kind, setKind] = useState<string | null>(null);
  const [types, setTypes] = useState<RequestType[]>([]);
  // 紐づいた稟議の折りたたみを開いている行
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [me, setMe] = useState<Me | null>(null);
  // タブの件数 (段のタブには番を、番の絞り込みには段を反映する。種類はどちらにも)
  const [counts, setCounts] = useState<RequestCounts | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [token, setTokenState] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRefreshing(true);
      const q = `turn=${turn}${status ? `&filter=${status}` : ''}${kind ? `&type=${kind}` : ''}`;
      const [data, count, self, typeList] = await Promise.all([
        apiFetch<RequestListItem[]>(`/requests?${q}`),
        apiFetch<RequestCounts>(`/requests/counts?${q}`),
        apiFetch<Me>('/me'),
        apiFetch<RequestType[]>('/request-types'),
      ]);
      setItems(data);
      setTypes(typeList);
      setCounts(count);
      setMe(self);
      setTokenState(await getToken());
    } catch (e) {
      Alert.alert('読み込めませんでした', (e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [status, turn, kind]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const logout = async () => {
    await clearToken();
    router.replace('/');
  };

  // 段のタブ・番の絞り込みのチップ 1つ。色で、選んでいるものはその色で塗り、ほかは色の点を付ける (「すべて」は色なし)
  const chip = (key: string, label: string, toneKey: FilterTone | null, on: boolean, onPress: () => void) => {
    const tone = toneKey ? toneColor(toneKey) : C.fg;
    return (
      <Pressable key={key} onPress={onPress} style={[s.chip, on && { backgroundColor: tone, borderColor: tone }]}>
        <Text style={[s.chipText, on && { color: C.card, fontWeight: '600' }]}>
          {toneKey && !on && <Text style={{ color: tone }}>● </Text>}
          {label}
        </Text>
      </Pressable>
    );
  };
  // 段のタブ。選んでいるタブをもう一度押すと、段の絞り込みを外す (全段)
  const statusChip = (key: StatusFilterKey) => {
    const f = STATUS_FILTERS.find((x) => x.key === key)!;
    const on = key === status;
    const label = `${f.label}${counts ? `（${counts.status[key]}）` : ''}${on ? ' ×' : ''}`;
    return chip(key, label, f.tone, on, () => setStatus(on ? null : key));
  };
  const turnChip = (key: TurnKey) => {
    const f = TURN_FILTERS.find((x) => x.key === key)!;
    const label = counts ? `${f.label}（${counts.turn[key]}）` : f.label;
    return chip(key, label, f.tone, key === turn, () => setTurn(key));
  };
  // 自分の番とそれ以外が混ざるときは、自分の番を先にして見出しで分ける (それぞれの中の並びは API のまま)
  const myTurn = items.filter((i) => i.my_turn);
  const others = items.filter((i) => !i.my_turn);
  const sections: { title: string | null; data: RequestListItem[] }[] =
    items.length === 0 ? [] : myTurn.length > 0 && others.length > 0
      ? [{ title: 'あなたの番', data: myTurn }, { title: 'そのほか', data: others }]
      : [{ title: null, data: items }];

  return (
    <View style={s.screen}>
      <View style={{ padding: 12, gap: 8 }}>
        {me && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={s.muted}>
              {me.family.name} · <Text style={s.link} onPress={() => router.push('/account')}>{me.name}</Text>
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Text style={s.link} onPress={() => router.push('/account')}>名前を変更</Text>
              <Text style={s.link} onPress={logout}>ログアウト</Text>
            </View>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Button title="ダッシュボード" size="sm" onPress={() => router.push('/dashboard')} />
          <Button title="マイページ" size="sm" onPress={() => router.push('/chores')} />
          <NotificationButton />
          {me?.can_request && (
            // 種類はフォームで選ぶ (絞り込み中の種類があれば初期値にする)
            <Button
              title="新しいプロジェクト"
              variant="primary"
              size="sm"
              style={{ flex: 1 }}
              onPress={() => router.push(kind ? `/requests/new?type=${kind}` : '/requests/new')}
            />
          )}
        </View>
      </View>
      <View style={{ gap: 6, paddingBottom: 8 }}>
        {/* 1段目: 段のタブ (件数つき。詳細と同じ3段の流れの枠で段ごとに並べる) / 2段目: 絞り込み (番と種類) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 6, alignItems: 'center' }}>
          {FILTER_STEPS.map((g, i) => {
            const on = status !== null && g.keys.includes(status);
            return (
              <View
                key={g.title}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4, paddingLeft: 8,
                  borderColor: on ? C.accent : C.border, borderWidth: 1, borderRadius: 8, backgroundColor: on ? C.accentSubtle : C.bg,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.fg }}>{i + 1}. {g.title}</Text>
                {g.keys.map(statusChip)}
              </View>
            );
          })}
        </ScrollView>
        {/* 絞り込み: 番と種類を1つの枠に並べる。段のタブと掛け合わせる */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4, paddingLeft: 8, borderColor: C.border, borderWidth: 1, borderRadius: 8, backgroundColor: C.bg }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.fg }}>絞り込み</Text>
            {TURN_FILTERS.map((f) => turnChip(f.key))}
            <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: C.border, marginHorizontal: 2 }} />
            {([null, ...types.filter((x) => !x.hidden || x.id === kind)] as (RequestType | null)[]).map((x) => {
              const on = (x?.id ?? null) === kind;
              return (
                <Pressable key={x?.id ?? 'any'} onPress={() => setKind(x?.id ?? null)} style={[s.chip, on && s.chipOn]}>
                  <Text style={[s.chipText, on && s.chipTextOn]}>{x ? `${x.icon} ${x.name}` : 'すべての種類'}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 40, gap: 8 }}>
            <Text style={s.muted}>該当する稟議はありません。</Text>
            {(status !== null || turn !== 'all') && (
              <Text style={s.link} onPress={() => { setStatus(null); setTurn('all'); }}>すべての稟議を見る</Text>
            )}
          </View>
        }
        renderSectionHeader={({ section }) =>
          section.title ? (
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted, marginTop: 4, marginBottom: 6 }}>
              {section.title}（{section.data.length}件）
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/requests/${item.id}`)}
            style={{
              backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 6, padding: 12, marginBottom: 8, flexDirection: 'row', gap: 10,
              // 自分の番の行は、左の黄色の線と薄い黄色の背景で目立たせる (「あなたの番」の印と同じ色)
              ...(item.my_turn && { backgroundColor: C.attentionSubtle, borderLeftWidth: 4, borderLeftColor: C.attentionBorder }),
            }}
          >
            {item.preview_id && (
              <Image
                source={{ uri: linkPreviewUrl(item.preview_id), headers: token ? { Authorization: `Bearer ${token}` } : undefined }}
                style={{ width: 48, height: 48, borderRadius: 6, backgroundColor: C.bg }}
              />
            )}
            <View style={{ flex: 1, gap: 4 }}>
              {/* タイトルと金額 / 状態・申請者・レビュアー・更新 */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: C.fg }}>{item.title}</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: C.fg }}>{money(item.actual_price ?? item.price, item.currency)}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <StatusBadge status={item.status} kind={item.kind} viewer={item.viewer_role} myTurn={item.my_turn} asked={item.asked_to_reply} />
                <Text style={s.muted}>
                  {item.requester_name} の申請 · レビュアー: {item.reviewer_names.join('、') || '—'}
                  {item.assignee_name ? ` · 担当: ${item.assignee_name}` : ''}
                  {' '}· {timeAgo(item.updated_at)}に更新{item.comment_count > 0 ? ` · 💬 ${item.comment_count}` : ''}
                </Text>
              </View>
              <Linked item={item} types={types} open={open.has(item.id)} onToggle={() => toggle(item.id)} />
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

/** 紐づいた稟議 (分岐元・分岐先) の折りたたみ。紐づいた稟議がない行には出さない */
function Linked({ item, types, open, onToggle }: { item: RequestListItem; types: RequestType[]; open: boolean; onToggle: () => void }) {
  const total = (item.parent ? 1 : 0) + item.children_count;
  if (total === 0) return null;
  const rest = item.children_count - item.children.length;
  const row = (x: LinkedRequest) => (
    <Pressable
      key={x.id}
      onPress={() => router.push(`/requests/${x.id}`)}
      style={{ borderLeftWidth: 2, borderLeftColor: C.border, paddingLeft: 8, paddingVertical: 4, marginLeft: 2 }}
    >
      <Text style={{ fontWeight: '600', color: C.fg, fontSize: 13 }}>
        <Text style={{ color: statusColor(x.status) }}>● </Text>
        {typeOf(types, x.type_id, x.kind).icon} {x.title}
      </Text>
      <Text style={[s.muted, { fontSize: 12 }]}>
        {x.requester_name} · {statusLabel(x.kind, x.status)} · {money(x.actual_price ?? x.price, x.currency)}
      </Text>
    </Pressable>
  );
  return (
    <View style={{ marginTop: 6 }}>
      <Pressable onPress={onToggle} hitSlop={6} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text style={[s.muted, { fontSize: 12 }]}>{open ? '▾' : '▸'} ⑂ 紐づいた稟議 {total}件</Text>
      </Pressable>
      {open && (
        <View style={{ marginTop: 4, gap: 2 }}>
          {item.parent && (
            <>
              <Text style={[s.muted, { fontSize: 12, fontWeight: '600' }]}>分岐元</Text>
              {row(item.parent)}
            </>
          )}
          {item.children.length > 0 && (
            <>
              <Text style={[s.muted, { fontSize: 12, fontWeight: '600', marginTop: 4 }]}>分岐先</Text>
              {item.children.map(row)}
              {rest > 0 && <Text style={[s.muted, { fontSize: 12 }]}>ほか {rest}件は詳細画面で</Text>}
            </>
          )}
        </View>
      )}
    </View>
  );
}

