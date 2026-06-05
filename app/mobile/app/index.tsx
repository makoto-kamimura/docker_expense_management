import { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { apiFetch, getToken, setToken } from '@/api';
import type { User } from '@/types';

export default function LoginScreen() {
  const [email, setEmail] = useState('employee@example.com');
  const [password, setPassword] = useState('password123');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (await getToken()) router.replace('/expenses');
    })();
  }, []);

  const onLogin = async () => {
    setBusy(true);
    try {
      const res = await apiFetch<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      await setToken(res.token);
      router.replace('/expenses');
    } catch (e) {
      Alert.alert('ログイン失敗', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>経費精算</Text>
      <Text style={styles.label}>メール</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <Text style={styles.label}>パスワード</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
      />
      <Button title={busy ? '送信中…' : 'ログイン'} onPress={onLogin} disabled={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#f5f6f8' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 24, textAlign: 'center' },
  label: { fontSize: 13, color: '#4b5563', marginTop: 12, marginBottom: 4 },
  input: {
    backgroundColor: '#fff',
    borderColor: '#d1d5db',
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
});
