import { useCallback, useState } from 'react';
import { Alert, FlatList, Image, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { apiFetch, clearToken, getToken, linkPreviewUrl } from '@/api';
import { money, timeAgo } from '@/format';
import { Button, C, STATUS_COLOR, s } from '@/components/ui';
import { LabelList } from '@/components/Labels';
import { FILTERS, KINDS, KIND_LABEL, KIND_TEXT, statusLabel, type Me, type RequestKind, type RequestListItem } from '@/types';

/** トップ: 申請一覧 + フィルター (memo.md §6) */
export default function RequestsScreen() {
  const [items, setItems] = useState<RequestListItem[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [kind, setKind] = useState<RequestKind | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [toReview, setToReview] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [token, setTokenState] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRefreshing(true);
      const [data, review, self] = await Promise.all([
        apiFetch<RequestListItem[]>(`/requests?filter=${filter}${kind ? `&kind=${kind}` : ''}`),
        apiFetch<RequestListItem[]>('/requests?filter=to_review'),
        apiFetch<Me>('/me'),
      ]);
      setItems(data);
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
              onPress={() => router.push(kind ? `/requests/new?kind=${kind}` : '/requests/new')}
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
                <Text style={[s.chipText, on && { color: '#fff', fontWeight: '600' }]}>{label}</Text>
              </Pressable>
            );
          })}
          <View style={{ width: 1, backgroundColor: C.border, marginHorizontal: 4 }} />
          {([null, ...KINDS] as (RequestKind | null)[]).map((k) => {
            const on = k === kind;
            return (
              <Pressable key={k ?? 'any'} onPress={() => setKind(k)} style={[s.chip, on && s.chipOn]}>
                <Text style={[s.chipText, on && s.chipTextOn]}>{k ? KIND_LABEL[k] : 'すべての種類'}</Text>
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
            style={{ backgroundColor: '#fff', borderColor: C.border, borderWidth: 1, borderRadius: 6, padding: 12, marginBottom: 8, flexDirection: 'row', gap: 10 }}
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 6, backgroundColor: STATUS_COLOR[item.status] }} />
            {item.preview_id && (
              <Image
                source={{ uri: linkPreviewUrl(item.preview_id), headers: token ? { Authorization: `Bearer ${token}` } : undefined }}
                style={{ width: 48, height: 48, borderRadius: 6, backgroundColor: C.bg }}
              />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: C.fg }}>{item.kind !== 'purchase' ? `${KIND_TEXT[item.kind].icon} ` : ''}{item.title}</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.fg, marginTop: 2 }}>{money(item.actual_price ?? item.price, item.currency)}</Text>
              <Text style={[s.muted, { fontWeight: '600', color: STATUS_COLOR[item.status] }]}>{statusLabel(item.kind, item.status)}</Text>
              <LabelList labels={item.labels} />
              <Text style={s.muted}>
                #{item.id.slice(0, 7)} · {item.requester_name} · レビュアー: {item.reviewer_names.join('、') || '—'}
              </Text>
              <Text style={s.muted}>
                {timeAgo(item.updated_at)}に更新{item.comment_count > 0 ? ` · 💬 ${item.comment_count}` : ''}{item.parent_id ? ` · ⑂ #${item.parent_id.slice(0, 7)} から分岐` : ''}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
