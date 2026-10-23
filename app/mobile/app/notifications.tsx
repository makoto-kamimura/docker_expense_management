import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { apiFetch } from '@/api';
import { timeAgo } from '@/format';
import { Button, C, s } from '@/components/ui';
import type { NotificationKind, NotificationList } from '@/types';
import { useTheme } from '@/theme';

const KIND_ICON: Record<NotificationKind, string> = {
  review_requested: '👀',
  resubmitted: '👀',
  reopened: '👀',
  changes_requested: '↩️',
  approved: '✅',
  rejected: '✖️',
  merged: '🟣',
  assigned: '🙋',
  purchased: '🛍',
  reply_requested: '💬',
  replied: '💬',
};

/** 自分宛ての通知。稟議を開くと、その稟議の通知は既読になる (OS の通知は Web だけ) */
export default function NotificationsScreen() {
  useTheme();
  const [list, setList] = useState<NotificationList | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRefreshing(true);
      setList(await apiFetch<NotificationList>('/notifications'));
    } catch (e) {
      Alert.alert('読み込めませんでした', (e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const readAll = async () => {
    try {
      await apiFetch('/notifications/read-all', { method: 'POST', body: '{}' });
      await load();
    } catch (e) {
      Alert.alert('既読にできませんでした', (e as Error).message);
    }
  };

  return (
    <View style={s.screen}>
      {list && list.unread > 0 && (
        <View style={{ padding: 12, paddingBottom: 0, flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Button title="すべて既読にする" size="sm" onPress={readAll} />
        </View>
      )}
      <FlatList
        data={list?.items ?? []}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        ListEmptyComponent={
          list ? <Text style={[s.muted, { textAlign: 'center', marginTop: 40 }]}>まだ通知はありません。</Text> : null
        }
        renderItem={({ item: n }) => (
          <Pressable
            onPress={() => router.push(`/requests/${n.request_id}`)}
            style={{
              backgroundColor: n.read_at ? C.card : C.accentSubtle,
              borderColor: C.border,
              borderWidth: 1,
              borderRadius: 6,
              padding: 12,
              marginBottom: 8,
              flexDirection: 'row',
              gap: 10,
            }}
          >
            <Text style={{ fontSize: 16 }}>{KIND_ICON[n.kind] ?? '•'}</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontWeight: '700', color: C.fg }}>{n.request_title}</Text>
              <Text style={{ color: C.fg }}>{n.message}</Text>
              <Text style={s.muted}>{timeAgo(n.created_at)}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
