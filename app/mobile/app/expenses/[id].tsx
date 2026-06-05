import { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Alert,
  TextInput,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  apiFetch,
  uploadReceipt,
  receiptUrl,
  authHeader,
  getToken,
} from '@/api';
import StatusStepper from '@/components/StatusStepper';
import { CATEGORY_LABEL, type Expense, type Receipt, type User } from '@/types';

export default function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [expense, setExpense] = useState<Expense | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [exp, recs, user, tk] = await Promise.all([
        apiFetch<Expense>(`/expenses/${id}`),
        apiFetch<Receipt[]>(`/expenses/${id}/receipts`),
        apiFetch<User>('/me'),
        getToken(),
      ]);
      setExpense(exp);
      setReceipts(recs);
      setMe(user);
      setTokenState(tk);
    } catch (e) {
      Alert.alert('読み込み失敗', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || !expense || !me) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const isOwner = expense.user_id === me.id;
  const isApprover = me.role === 'approver' || me.role === 'admin';
  const canEdit = isOwner && (expense.status === 'draft' || expense.status === 'rejected');
  const canSubmit = isOwner && (expense.status === 'draft' || expense.status === 'rejected');
  const canDecide = isApprover && expense.status === 'submitted';
  const canDelete = (isOwner || me.role === 'admin') && expense.status !== 'approved';
  const canUpload = isOwner || me.role === 'admin';

  const run = async (fn: () => Promise<unknown>, errTitle: string, after?: () => void) => {
    setBusy(true);
    try {
      await fn();
      if (after) after();
      else await load();
    } catch (e) {
      Alert.alert(errTitle, (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = () =>
    run(() => apiFetch(`/expenses/${id}/submit`, { method: 'POST' }), '申請失敗');

  const onDecide = (approve: boolean) =>
    run(
      () =>
        apiFetch(`/expenses/${id}/${approve ? 'approve' : 'reject'}`, {
          method: 'POST',
          body: JSON.stringify({ note: note.trim() || null }),
        }),
      approve ? '承認失敗' : '却下失敗',
    );

  const onDelete = () =>
    Alert.alert('削除しますか？', 'この申請を削除します。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () =>
          run(
            () => apiFetch(`/expenses/${id}`, { method: 'DELETE' }),
            '削除失敗',
            () => router.back(),
          ),
      },
    ]);

  const pickAndUpload = async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('権限が必要です');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    if (result.canceled) return;
    await run(() => uploadReceipt(id!, result.assets[0].uri), 'アップロード失敗');
  };

  const onAddReceipt = () =>
    Alert.alert('領収書を追加', undefined, [
      { text: 'カメラで撮影', onPress: () => pickAndUpload(true) },
      { text: 'ライブラリから選択', onPress: () => pickAndUpload(false) },
      { text: 'キャンセル', style: 'cancel' },
    ]);

  const imgHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.h1}>{expense.title}</Text>

      <View style={styles.card}>
        <StatusStepper status={expense.status} />
        <Row label="カテゴリ" value={CATEGORY_LABEL[expense.category]} />
        <Row label="発生日" value={expense.incurred_on} />
        <Row label="金額" value={`¥${expense.amount_jpy.toLocaleString()}`} />
        <Row label="説明" value={expense.description ?? '—'} />
        <Row label="申請日時" value={fmt(expense.submitted_at)} />
        <Row label="判定日時" value={fmt(expense.decided_at)} />
        <Row label="判定メモ" value={expense.decision_note ?? '—'} last />

        <View style={styles.actions}>
          {canEdit && (
            <Pressable style={[styles.btn, styles.btnBlue]} disabled={busy} onPress={() => router.push(`/expenses/edit/${id}`)}>
              <Text style={styles.btnText}>編集</Text>
            </Pressable>
          )}
          {canSubmit && (
            <Pressable style={[styles.btn, styles.btnGreen]} disabled={busy} onPress={onSubmit}>
              <Text style={styles.btnText}>申請する</Text>
            </Pressable>
          )}
          {canDelete && (
            <Pressable style={[styles.btn, styles.btnRed]} disabled={busy} onPress={onDelete}>
              <Text style={styles.btnText}>削除</Text>
            </Pressable>
          )}
        </View>
      </View>

      {canDecide && (
        <View style={styles.card}>
          <Text style={styles.h2}>承認 / 却下</Text>
          <Text style={styles.label}>メモ（任意）</Text>
          <TextInput
            style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="承認・却下の理由など"
          />
          <View style={[styles.actions, { marginTop: 12 }]}>
            <Pressable style={[styles.btn, styles.btnGreen]} disabled={busy} onPress={() => onDecide(true)}>
              <Text style={styles.btnText}>承認</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnRed]} disabled={busy} onPress={() => onDecide(false)}>
              <Text style={styles.btnText}>却下</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.h2}>領収書</Text>
        {receipts.length === 0 ? (
          <Text style={styles.muted}>アップロードされた領収書はありません。</Text>
        ) : (
          receipts.map((r) => (
            <View key={r.id} style={styles.receipt}>
              <Image
                source={{ uri: receiptUrl(r.id), headers: imgHeaders }}
                style={styles.thumb}
                resizeMode="cover"
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.receiptName} numberOfLines={1}>{r.file_name}</Text>
                <Text style={styles.muted}>
                  {Math.round(r.byte_size / 1024)} KB ・ {fmt(r.uploaded_at)}
                </Text>
              </View>
            </View>
          ))
        )}
        {canUpload && (
          <Pressable style={[styles.btn, styles.btnBlue, { marginTop: 12 }]} disabled={busy} onPress={onAddReceipt}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>＋ 領収書を追加</Text>}
          </Pressable>
        )}
      </View>

      <Pressable style={[styles.btn, styles.btnGray, { marginBottom: 32 }]} onPress={() => router.back()}>
        <Text style={[styles.btnText, { color: '#1f2937' }]}>一覧へ戻る</Text>
      </Pressable>
    </ScrollView>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.tr, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.th}>{label}</Text>
      <Text style={styles.td}>{value}</Text>
    </View>
  );
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ja-JP');
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6f8' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f6f8' },
  h1: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  h2: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  card: { backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, borderRadius: 8, padding: 16, marginBottom: 16 },
  tr: { flexDirection: 'row', borderBottomColor: '#eef0f3', borderBottomWidth: 1, paddingVertical: 8 },
  th: { width: 90, color: '#4b5563', fontWeight: '600', fontSize: 13 },
  td: { flex: 1, fontSize: 14, color: '#1f2330' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnGreen: { backgroundColor: '#16a34a' },
  btnRed: { backgroundColor: '#dc2626' },
  btnBlue: { backgroundColor: '#2563eb' },
  btnGray: { backgroundColor: '#fff', borderColor: '#d1d5db', borderWidth: 1 },
  label: { fontSize: 13, color: '#4b5563', marginBottom: 4 },
  input: { backgroundColor: '#fff', borderColor: '#d1d5db', borderWidth: 1, borderRadius: 6, padding: 10 },
  muted: { color: '#6b7280', fontSize: 13 },
  receipt: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomColor: '#eef0f3', borderBottomWidth: 1 },
  thumb: { width: 56, height: 56, borderRadius: 6, backgroundColor: '#eef0f3' },
  receiptName: { fontSize: 14, fontWeight: '600' },
});
