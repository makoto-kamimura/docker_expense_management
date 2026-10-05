import { useCallback, useState } from 'react';
import { Alert, FlatList, Image, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { apiFetch, clearToken, getToken, linkPreviewUrl } from '@/api';
import { money, timeAgo } from '@/format';
import { Button, C, s, statusColor } from '@/components/ui';
import { LabelList } from '@/components/Labels';
import { FILTERS, statusLabel, typeOf, type LinkedRequest, type Me, type RequestListItem, type RequestType } from '@/types';
import { useTheme } from '@/theme';

/** トップ: 申請一覧 + フィルター (readme.md 8.6節) */
export default function RequestsScreen() {
  useTheme();
  const [items, setItems] = useState<RequestListItem[]>([]);
  const [filter, setFilter] = useState<string>('all');
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
  const [toReview, setToReview] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [token, setTokenState] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRefreshing(true);
      const [data, review, self, typeList] = await Promise.all([
        apiFetch<RequestListItem[]>(`/requests?filter=${filter}${kind ? `&type=${kind}` : ''}`),
        apiFetch<RequestListItem[]>('/requests?filter=to_review'),
        apiFetch<Me>('/me'),
        apiFetch<RequestType[]>('/request-types'),
      ]);
      setItems(data);
      setTypes(typeList);
      setToReview(review.length);
      setMe(self);
      setTokenState(await getToken());
    } catch (e) {
      Alert.alert('読み込めませんでした', (e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [filter, kind]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const logout = async () => {
    await clearToken();
    router.replace('/');
  };

  return (
    <View style={s.screen}>
      <View style={{ padding: 12, gap: 8 }}>
        {me && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={s.muted}>{me.family.name} · {me.name}</Text>
            <Text style={s.link} onPress={logout}>ログアウト</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Button title="ダッシュボード" size="sm" onPress={() => router.push('/dashboard')} />
          <Button title="マイページ" size="sm" onPress={() => router.push('/chores')} />
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
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 6, paddingBottom: 8 }}>
          {FILTERS.map((f) => {
            const on = f.key === filter;
            const label = f.key === 'to_review' && toReview > 0 ? `${f.label}（${toReview}）` : f.label;
            return (
              <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[s.chip, on && { backgroundColor: C.fg, borderColor: C.fg }]}>
                <Text style={[s.chipText, on && { color: C.card, fontWeight: '600' }]}>{label}</Text>
              </Pressable>
            );
          })}
          <View style={{ width: 1, backgroundColor: C.border, marginHorizontal: 4 }} />
          {([null, ...types.filter((x) => !x.hidden || x.id === kind)] as (RequestType | null)[]).map((x) => {
            const on = (x?.id ?? null) === kind;
            return (
              <Pressable key={x?.id ?? 'any'} onPress={() => setKind(x?.id ?? null)} style={[s.chip, on && s.chipOn]}>
                <Text style={[s.chipText, on && s.chipTextOn]}>{x ? `${x.icon} ${x.name}` : 'すべての種類'}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        ListEmptyComponent={<Text style={[s.muted, { textAlign: 'center', marginTop: 40 }]}>該当する稟議はありません。</Text>}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/requests/${item.id}`)}
            style={{ backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 6, padding: 12, marginBottom: 8, flexDirection: 'row', gap: 10 }}
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 6, backgroundColor: statusColor(item.status) }} />
            {item.preview_id && (
              <Image
                source={{ uri: linkPreviewUrl(item.preview_id), headers: token ? { Authorization: `Bearer ${token}` } : undefined }}
                style={{ width: 48, height: 48, borderRadius: 6, backgroundColor: C.bg }}
              />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: C.fg }}>{typeOf(types, item.type_id, item.kind).icon} {item.title}</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.fg, marginTop: 2 }}>{money(item.actual_price ?? item.price, item.currency)}</Text>
              <Text style={[s.muted, { fontWeight: '600', color: statusColor(item.status) }]}>{statusLabel(item.kind, item.status)}</Text>
              <LabelList labels={item.labels} />
              <Text style={s.muted}>
                #{item.id.slice(0, 7)} · {item.requester_name} · レビュアー: {item.reviewer_names.join('、') || '—'}
              </Text>
              <Text style={s.muted}>
                {timeAgo(item.updated_at)}に更新{item.comment_count > 0 ? ` · 💬 ${item.comment_count}` : ''}
              </Text>
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
        #{x.id.slice(0, 7)} · {x.requester_name} · {statusLabel(x.kind, x.status)} · {money(x.actual_price ?? x.price, x.currency)}
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

