import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { apiFetch, getToken, ocrReceipt, uploadAttachment } from '@/api';
import { money } from '@/format';
import { AttachmentList, pickAndUpload } from '@/components/Attachments';
import { Button, Card, s } from '@/components/ui';
import { KIND_TEXT, type RequestDetail } from '@/types';

/** Mark as Purchased (memo.md §17)。レシート撮影で実額・購入日を自動入力できる。 */
export default function PurchaseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [d, setD] = useState<RequestDetail | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [actual, setActual] = useState('');
  const [date, setDate] = useState(new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10));
  const [order, setOrder] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<'scan' | 'save' | null>(null);

  const load = useCallback(async () => {
    const [detail, tk] = await Promise.all([apiFetch<RequestDetail>(`/requests/${id}`), getToken()]);
    setD(detail);
    setTokenState(tk);
    setActual((prev) => prev || String(detail.request.price));
    setUrl((prev) => prev || detail.request.product_url || '');
  }, [id]);

  useFocusEffect(useCallback(() => { load().catch((e) => Alert.alert('読み込めませんでした', (e as Error).message)); }, [load]));

  if (!d) return <View style={s.center}><ActivityIndicator /></View>;
  const receipts = d.attachments.filter((a) => a.kind === 'receipt');
  const t = KIND_TEXT[d.request.kind];

  // レシートを撮影 → OCR で金額・日付を読み取り、そのままレシートとして添付する
  const scan = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('カメラの権限が必要です');
    const shot = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (shot.canceled) return;
    setBusy('scan');
    try {
      const asset = shot.assets[0];
      const [r] = await Promise.all([
        ocrReceipt(asset.uri),
        uploadAttachment(id!, 'receipt', { uri: asset.uri, name: asset.fileName, mimeType: asset.mimeType }),
      ]);
      if (r.amount_jpy != null) setActual(String(r.amount_jpy));
      if (r.incurred_on) setDate(r.incurred_on);
      Alert.alert('読み取りました', '金額と日付を確認してください。');
      await load();
    } catch (e) {
      Alert.alert('読み取りに失敗しました', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy('save');
    try {
      await apiFetch(`/requests/${id}/purchase`, {
        method: 'POST',
        body: JSON.stringify({
          actual_price: Number(actual) || 0,
          purchase_date: date,
          order_number: order.trim() || null,
          final_product_url: url.trim() || null,
        }),
      });
      router.back();
    } catch (e) {
      Alert.alert('保存できませんでした', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 18, fontWeight: '600' }}>{d.request.title}</Text>
      <Text style={[s.muted, { marginBottom: 12 }]}>承認された{t.priceShort}: {money(d.request.price, d.request.currency)}</Text>

      <Card title={t.receipt}>
        {receipts.length > 0 ? <AttachmentList files={receipts} token={token} /> : <Text style={s.muted}>まだ添付されていません。</Text>}
        <View style={{ gap: 8, marginTop: 10 }}>
          <Button title="📷 レシートを撮影して自動入力" variant="blue" busy={busy === 'scan'} onPress={scan} />
          <Button title="写真・ファイルから添付" onPress={async () => { if (await pickAndUpload(id!, 'receipt')) load(); }} />
        </View>
      </Card>

      <Card title={t.record}>
        <Text style={[s.label, { marginTop: 0 }]}>{t.actualPrice} *</Text>
        <TextInput style={s.input} value={actual} onChangeText={setActual} keyboardType="number-pad" />
        <Text style={s.label}>{t.doneDate} * (YYYY-MM-DD)</Text>
        <TextInput style={s.input} value={date} onChangeText={setDate} />
        <Text style={s.label}>{t.orderNo}</Text>
        <TextInput style={s.input} value={order} onChangeText={setOrder} />
        <Text style={s.label}>{t.finalUrl}</Text>
        <TextInput style={s.input} value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" />
      </Card>

      <Button title={t.markDone} variant="blue" busy={busy === 'save'} onPress={save} />
    </ScrollView>
  );
}
