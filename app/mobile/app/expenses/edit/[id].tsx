import { useCallback, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { apiFetch } from '@/api';
import { CATEGORY_LABEL, type Expense, type ExpenseCategory } from '@/types';

const CATEGORIES = Object.entries(CATEGORY_LABEL) as [ExpenseCategory, string][];

export default function EditExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('0');
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [incurredOn, setIncurredOn] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const e = await apiFetch<Expense>(`/expenses/${id}`);
      setTitle(e.title);
      setAmount(String(e.amount_jpy));
      setCategory(e.category);
      setIncurredOn(e.incurred_on);
      setDescription(e.description ?? '');
    } catch (e) {
      Alert.alert('読み込み失敗', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    setBusy(true);
    try {
      await apiFetch(`/expenses/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title,
          description: description || null,
          category,
          amount_jpy: Number(amount) || 0,
          incurred_on: incurredOn,
        }),
      });
      router.back();
    } catch (e) {
      Alert.alert('保存失敗', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.label}>件名</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} />
      <Text style={styles.label}>金額 (円)</Text>
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="number-pad" />
      <Text style={styles.label}>発生日 (YYYY-MM-DD)</Text>
      <TextInput style={styles.input} value={incurredOn} onChangeText={setIncurredOn} />
      <Text style={styles.label}>カテゴリ</Text>
      <View style={styles.catRow}>
        {CATEGORIES.map(([key, label]) => (
          <Text
            key={key}
            onPress={() => setCategory(key)}
            style={[styles.catChip, category === key && styles.catChipActive]}
          >
            {label}
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
      <View style={{ marginTop: 16 }}>
        <Button title={busy ? '保存中…' : '変更を保存'} onPress={save} disabled={busy || !title} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6f8' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f6f8' },
  label: { fontSize: 13, color: '#4b5563', marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: '#fff', borderColor: '#d1d5db', borderWidth: 1, borderRadius: 6, padding: 10 },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catChip: { backgroundColor: '#fff', borderColor: '#d1d5db', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginRight: 6, marginBottom: 6, fontSize: 13 },
  catChipActive: { backgroundColor: '#dbeafe', borderColor: '#2563eb', color: '#1d4ed8' },
});
