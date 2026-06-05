import { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, Pressable, Alert } from 'react-native';
import { Link, router, useFocusEffect } from 'expo-router';
import { apiFetch, clearToken } from '@/api';
import { STATUS_LABEL, type Expense } from '@/types';

export default function ExpensesScreen() {
  const [items, setItems] = useState<Expense[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRefreshing(true);
      const data = await apiFetch<Expense[]>('/expenses?mine=true');
      setItems(data);
    } catch (e) {
      Alert.alert('読み込み失敗', (e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const logout = async () => {
    await clearToken();
    router.replace('/');
  };

  // 下書き/却下の申請を承認依頼に出す
  const confirmSubmit = (item: Expense) => {
    Alert.alert('申請しますか？', `「${item.title}」を承認依頼に出します。`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '申請する',
        onPress: async () => {
          try {
            await apiFetch(`/expenses/${item.id}/submit`, { method: 'POST' });
            load();
          } catch (e) {
            Alert.alert('申請失敗', (e as Error).message);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Link href="/expenses/new" asChild>
          <Pressable style={styles.primaryBtn}><Text style={styles.primaryBtnText}>+ 新規申請</Text></Pressable>
        </Link>
        <Pressable style={styles.secondaryBtn} onPress={logout}>
          <Text style={styles.secondaryBtnText}>ログアウト</Text>
        </Pressable>
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        ListEmptyComponent={<Text style={styles.muted}>申請はまだありません。</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable style={{ flex: 1 }} onPress={() => router.push(`/expenses/${item.id}`)}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.muted}>{item.incurred_on} ・ ¥{item.amount_jpy.toLocaleString()}</Text>
            </Pressable>
            <View style={styles.rowRight}>
              <Text style={[styles.badge, badgeColor(item.status)]}>{STATUS_LABEL[item.status]}</Text>
              {(item.status === 'draft' || item.status === 'rejected') && (
                <Pressable style={styles.submitChip} onPress={() => confirmSubmit(item)}>
                  <Text style={styles.submitChipText}>申請する</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
}

function badgeColor(status: Expense['status']) {
  switch (status) {
    case 'approved': return { backgroundColor: '#bbf7d0', color: '#166534' };
    case 'submitted': return { backgroundColor: '#fde68a', color: '#92400e' };
    case 'rejected': return { backgroundColor: '#fecaca', color: '#991b1b' };
    default: return { backgroundColor: '#e5e7eb', color: '#374151' };
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f6f8' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  primaryBtn: { backgroundColor: '#2563eb', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 },
  primaryBtnText: { color: '#fff', fontWeight: '600' },
  secondaryBtn: { backgroundColor: '#fff', borderColor: '#d1d5db', borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 },
  secondaryBtnText: { color: '#1f2937' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 8 },
  rowRight: { alignItems: 'flex-end', gap: 6 },
  submitChip: { backgroundColor: '#16a34a', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  submitChipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  title: { fontSize: 15, fontWeight: '600' },
  muted: { color: '#6b7280', fontSize: 13, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, fontSize: 12, fontWeight: '600', overflow: 'hidden' },
});
