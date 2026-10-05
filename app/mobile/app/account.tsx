import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { apiFetch } from '@/api';
import { Button, Card, s } from '@/components/ui';
import type { Me } from '@/types';
import { useTheme } from '@/theme';

/** アカウント: 自分の表示名を変える */
export default function AccountScreen() {
  useTheme();
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<Me>('/me')
      .then((self) => {
        setMe(self);
        setName(self.name);
      })
      .catch((e) => Alert.alert('読み込めませんでした', (e as Error).message));
  }, []);

  if (!me) return <View style={s.center}><ActivityIndicator /></View>;

  const save = async () => {
    setBusy(true);
    try {
      await apiFetch<Me>('/me', { method: 'PUT', body: JSON.stringify({ name }) });
      router.back();
    } catch (e) {
      Alert.alert('保存できませんでした', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[s.screen, { padding: 12 }]}>
      <Card title="表示名" ja="稟議・レビュアー・コメントなどに表示される名前">
        <TextInput style={s.input} value={name} onChangeText={setName} maxLength={50} autoFocus accessibilityLabel="表示名" />
        <Text style={[s.muted, { marginTop: 6 }]}>{me.email}</Text>
      </Card>
      <Button title="保存" variant="primary" busy={busy} disabled={!name.trim() || busy} onPress={save} />
    </View>
  );
}
