import { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { apiFetch, ocrReceipt } from '@/api';
import type { Expense, ExpenseCategory } from '@/types';

const CATEGORIES: { key: ExpenseCategory; label: string }[] = [
  { key: 'travel', label: '交通費' },
  { key: 'meals', label: '会議費・食事' },
  { key: 'accommodation', label: '宿泊' },
  { key: 'supplies', label: '備品' },
  { key: 'entertainment', label: '交際費' },
  { key: 'communication', label: '通信費' },
  { key: 'other', label: 'その他' },
];

export default function NewExpenseScreen() {
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('0');
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [incurredOn, setIncurredOn] = useState(today);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);

  // レシートを撮影して OCR し、金額・発生日を自動入力する
  const scanReceipt = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('カメラの権限が必要です', '設定からカメラを許可してください。');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (shot.canceled) return;

    setOcrBusy(true);
    try {
      const r = await ocrReceipt(shot.assets[0].uri);
      if (r.amount_jpy != null) setAmount(String(r.amount_jpy));
      if (r.incurred_on) setIncurredOn(r.incurred_on);
      const got = [
        r.amount_jpy != null ? `金額: ¥${r.amount_jpy.toLocaleString()}` : null,
        r.incurred_on ? `発生日: ${r.incurred_on}` : null,
      ].filter(Boolean);
      Alert.alert(
        '読み取り完了',
        got.length ? `${got.join('\n')}\n\n内容を確認のうえ修正してください。` : '金額・日付を読み取れませんでした。手入力してください。',
      );
    } catch (e) {
      Alert.alert('OCR失敗', (e as Error).message);
    } finally {
      setOcrBusy(false);
    }
  };

  // submitAfter=true なら下書き作成後にそのまま申請(承認依頼)まで行う
  const save = async (submitAfter: boolean) => {
    setBusy(true);
    try {
      const created = await apiFetch<Expense>('/expenses', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description: description || null,
          category,
          amount_jpy: Number(amount) || 0,
          incurred_on: incurredOn,
        }),
      });
      if (submitAfter) {
        await apiFetch(`/expenses/${created.id}/submit`, { method: 'POST' });
      }
      router.back();
    } catch (e) {
      Alert.alert(submitAfter ? '申請失敗' : '保存失敗', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Pressable
        onPress={scanReceipt}
        disabled={ocrBusy}
        style={[styles.scanBtn, ocrBusy && styles.scanBtnBusy]}
      >
        {ocrBusy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.scanBtnText}>📷 レシートを撮影して自動入力</Text>
        )}
      </Pressable>
      <Text style={styles.hint}>金額と発生日を自動で読み取ります（要確認・修正可）</Text>

      <Text style={styles.label}>件名</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} />
      <Text style={styles.label}>金額 (円)</Text>
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="number-pad" />
      <Text style={styles.label}>発生日 (YYYY-MM-DD)</Text>
      <TextInput style={styles.input} value={incurredOn} onChangeText={setIncurredOn} />
      <Text style={styles.label}>カテゴリ</Text>
      <View style={styles.catRow}>
        {CATEGORIES.map((c) => (
          <Text
            key={c.key}
            onPress={() => setCategory(c.key)}
            style={[styles.catChip, category === c.key && styles.catChipActive]}
          >
            {c.label}
          </Text>
        ))}
      </View>
      <Text style={styles.label}>説明</Text>
      <TextInput
        style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
        value={description}
        onChangeText={setDescription}
        multiline
      />
      <View style={{ marginTop: 16, gap: 10 }}>
        <Pressable
          onPress={() => save(true)}
          disabled={busy || !title}
          style={[styles.submitBtn, (busy || !title) && styles.scanBtnBusy]}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>保存して申請する</Text>}
        </Pressable>
        <Button title={busy ? '処理中…' : '下書き保存のみ'} onPress={() => save(false)} disabled={busy || !title} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6f8' },
  scanBtn: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  scanBtnBusy: { opacity: 0.6 },
  scanBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  submitBtn: { backgroundColor: '#16a34a', borderRadius: 8, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 12, color: '#6b7280', marginTop: 6 },
  label: { fontSize: 13, color: '#4b5563', marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: '#fff', borderColor: '#d1d5db', borderWidth: 1, borderRadius: 6, padding: 10 },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catChip: { backgroundColor: '#fff', borderColor: '#d1d5db', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginRight: 6, marginBottom: 6, fontSize: 13 },
  catChipActive: { backgroundColor: '#dbeafe', borderColor: '#2563eb', color: '#1d4ed8' },
});
