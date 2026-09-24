import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { apiFetch, getToken, setToken } from '@/api';
import { Button, C, s } from '@/components/ui';
import type { Me, Member } from '@/types';

/** ログイン。初回はオンボーディングへ、それ以外は申請一覧へ進む。 */
export default function LoginScreen() {
  const [email, setEmail] = useState('dad@example.com');
  const [password, setPassword] = useState('password123');
  const [busy, setBusy] = useState(false);

  const next = async () => {
    const me = await apiFetch<Me>('/me');
    router.replace(me.onboarded ? '/requests' : '/onboarding');
  };

  useEffect(() => {
    (async () => {
      if (await getToken()) next().catch(() => {});
    })();
  }, []);

  const onLogin = async () => {
    setBusy(true);
    try {
      const res = await apiFetch<{ token: string; user: Member }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      await setToken(res.token);
      await next();
    } catch (e) {
      Alert.alert('ログインできませんでした', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[s.screen, { padding: 24 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ alignItems: 'center', marginVertical: 32 }}>
        <Text style={{ color: C.muted, fontWeight: '600' }}>稟議をマージ</Text>
        <Text style={{ fontSize: 30, fontWeight: '700', color: C.fg }}>RingiWoMerge</Text>
        <Text style={s.muted}>大きな買い物は、家族のレビューを通してから。</Text>
      </View>
      <Text style={s.label}>メールアドレス</Text>
      <TextInput style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
      <Text style={s.label}>パスワード</Text>
      <TextInput style={s.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
      <Button title="ログイン" variant="primary" onPress={onLogin} busy={busy} style={{ marginTop: 20 }} />
      <Text style={[s.muted, { marginTop: 16, textAlign: 'center' }]}>
        デモ: dad@ / mom@ / child@example.com · password123{'\n'}
        家族の新規作成は Web から行えます。
      </Text>
    </KeyboardAvoidingView>
  );
}
