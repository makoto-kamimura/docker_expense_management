import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { apiFetch } from '@/api';
import { Button, C, Card, s } from '@/components/ui';
import type { Me } from '@/types';
import { useTheme } from '@/theme';
import { signInWithSso } from '@/ssoAuth';

/** アカウント: 自分の表示名を変える。SSO の連携・解除 */
export default function AccountScreen() {
  useTheme();
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [ids, setIds] = useState<Identities | null>(null);
  const [ssoBusy, setSsoBusy] = useState(false);

  const loadIdentities = () =>
    apiFetch<Identities>('/me/identities')
      .then(setIds)
      .catch(() => setIds(null));

  useEffect(() => {
    loadIdentities();
  }, []);

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

  const linked = ids?.identities.find((i) => i.provider === 'sso');
  const ssoName = ids?.sso_name || 'SSO';

  const link = async () => {
    setSsoBusy(true);
    try {
      const res = await signInWithSso('link');
      if (res?.mode === 'link') Alert.alert('連携しました', res.email ?? `${ssoName} のアカウントを連携しました`);
      await loadIdentities();
    } catch (e) {
      Alert.alert('連携できませんでした', (e as Error).message);
    } finally {
      setSsoBusy(false);
    }
  };

  const unlink = () =>
    Alert.alert('連携を解除しますか？', `「${ssoName} だけ」も外れ、メールアドレスとパスワードでログインできるようになります。`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '解除',
        style: 'destructive',
        onPress: async () => {
          setSsoBusy(true);
          try {
            await apiFetch('/me/identities/sso', { method: 'DELETE' });
            await loadIdentities();
          } catch (e) {
            Alert.alert('解除できませんでした', (e as Error).message);
          } finally {
            setSsoBusy(false);
          }
        },
      },
    ]);

  const setSsoOnly = (enabled: boolean) => {
    const apply = async () => {
      setSsoBusy(true);
      try {
        await apiFetch('/me/sso-only', { method: 'PUT', body: JSON.stringify({ enabled }) });
        await loadIdentities();
      } catch (e) {
        Alert.alert('切り替えられませんでした', (e as Error).message);
      } finally {
        setSsoBusy(false);
      }
    };
    if (!enabled) return void apply();
    Alert.alert(
      `${ssoName} だけでログインしますか？`,
      'メールアドレスとパスワードではログインできなくなります。ほかの端末でパスワードで入っているログインも切れます。',
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: 'オンにする', onPress: () => void apply() },
      ],
    );
  };

  return (
    <View style={[s.screen, { padding: 12 }]}>
      <Card title="表示名" ja="稟議・レビュアー・コメントなどに表示される名前">
        <TextInput style={s.input} value={name} onChangeText={setName} maxLength={50} autoFocus accessibilityLabel="表示名" />
        <Text style={[s.muted, { marginTop: 6 }]}>{me.email}</Text>
      </Card>
      <Button title="保存" variant="primary" busy={busy} disabled={!name.trim() || busy} onPress={save} />
      {ids?.sso_enabled && (
        <View style={{ marginTop: 16 }}>
          <Card title={`${ssoName} でログイン`} ja="共通のアカウントと連携すると、ほかのアプリと同じログインで入れる">
            {linked ? (
              <>
                <Text style={{ color: C.fg }}>連携済み: {linked.email ?? `${ssoName} のアカウント`}</Text>
                <Text style={{ color: C.fg, marginTop: 12 }}>
                  {ssoName} だけでログインする: {ids.sso_only ? 'オン' : 'オフ'}
                </Text>
                {ids.sso_only ? (
                  <Button title="オフにする" busy={ssoBusy} onPress={() => setSsoOnly(false)} style={{ marginTop: 8 }} />
                ) : ids.login_method === 'sso' ? (
                  <Button title="オンにする" variant="primary" busy={ssoBusy} onPress={() => setSsoOnly(true)} style={{ marginTop: 8 }} />
                ) : (
                  <Text style={[s.muted, { marginTop: 6, fontSize: 12 }]}>
                    オンにするには、いったんログアウトして「{ssoName} でログイン」で入り直してください。
                  </Text>
                )}
                <Button title="連携を解除" variant="danger" busy={ssoBusy} onPress={unlink} style={{ marginTop: 10 }} />
              </>
            ) : ids.can_link ? (
              <Button title={`${ssoName} のアカウントと連携する`} busy={ssoBusy} onPress={link} />
            ) : (
              <Text style={s.muted}>デモ用のアカウントには {ssoName} を連携できません。</Text>
            )}
            <Text style={[s.muted, { marginTop: 8, fontSize: 12 }]}>
              このアプリには、{ssoName} にパスキーでログインした場合だけ入れます。
            </Text>
          </Card>
        </View>
      )}
    </View>
  );
}

type Identities = {
  sso_enabled: boolean;
  sso_name: string | null;
  can_link: boolean;
  sso_only: boolean;
  login_method: 'pwd' | 'sso';
  identities: { provider: string; email: string | null }[];
};
