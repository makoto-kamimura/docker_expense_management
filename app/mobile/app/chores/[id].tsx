import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { apiFetch, choreImageUrl, getToken } from '@/api';
import { C, Card, s } from '@/components/ui';
import type { ChoresResp } from '@/types';
import { choreScheduleLabel } from '@/format';

/** 家事の「きれいな状態の見本」(見るだけ。画像の追加・編集は Web で行う) */
export default function ChoreDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [d, setD] = useState<ChoresResp | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    getToken().then(setToken);
    apiFetch<ChoresResp>('/chores').then(setD).catch((e) => Alert.alert('読み込めませんでした', (e as Error).message));
  }, []));

  if (!d) return <View style={s.center}><ActivityIndicator /></View>;
  const chore = d.chores.find((c) => c.id === id);
  if (!chore) return <View style={s.center}><Text style={s.muted}>家事が見つかりません</Text></View>;
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 12, paddingBottom: 48 }}>
      <Text style={{ fontSize: 22, fontWeight: '600', color: C.fg }}>{chore.icon} {chore.name}</Text>
      {!!chore.description && <Text style={[s.muted, { marginTop: 4 }]}>{chore.description}</Text>}
      {!!choreScheduleLabel(chore) && <Text style={{ marginTop: 4, color: C.fg }}>{choreScheduleLabel(chore)}</Text>}
      <View style={{ height: 8 }} />
      <Card title="きれいな状態の見本" ja="この状態を保てたらコミット">
        {chore.images.length === 0 && <Text style={s.muted}>まだ見本の画像はありません。Web の画面から追加できます (管理者)。</Text>}
        {chore.images.map((img, i) => (
          <View key={img.id} style={{ marginBottom: 14 }}>
            <Image
              source={{ uri: choreImageUrl(img.id), headers }}
              style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 6, backgroundColor: C.bg }}
              resizeMode="cover"
              accessibilityLabel={img.caption || `見本 ${i + 1}`}
            />
            <Text style={{ marginTop: 6, color: img.caption ? C.fg : C.muted, lineHeight: 20 }}>{img.caption || '説明はありません'}</Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}
