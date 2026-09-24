import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { apiFetch } from '@/api';
import { describeEvent, fieldLabel, fmtDateTime, formatChangeValue, type FieldChange } from '@/format';
import { C, s } from '@/components/ui';
import type { RequestDetail, TimelineEntry } from '@/types';

type EventEntry = Extract<TimelineEntry, { type: 'event' }>;

/** 稟議の変更履歴。操作を新しい順に並べ、編集は変更前 → 変更後を表示する (Web の履歴タブと同じ内容) */
export default function HistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [d, setD] = useState<RequestDetail | null>(null);

  useFocusEffect(useCallback(() => {
    apiFetch<RequestDetail>(`/requests/${id}`).then(setD).catch((e) => Alert.alert('読み込めませんでした', (e as Error).message));
  }, [id]));

  if (!d) return <View style={s.center}><ActivityIndicator /></View>;
  const r = d.request;
  const events = d.timeline.filter((e): e is EventEntry => e.type === 'event').reverse();

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
      <Text style={{ fontSize: 18, fontWeight: '600', color: C.fg, marginBottom: 12 }}>{r.title}</Text>
      {events.length === 0 && <Text style={s.muted}>履歴はまだありません。</Text>}
      {events.map((e) => {
        const changes = (e.metadata.changes as FieldChange[] | undefined) ?? [];
        return (
          <View key={e.id} style={{ borderColor: C.border, borderWidth: 1, borderRadius: 6, padding: 12, marginBottom: 8, backgroundColor: '#fff' }}>
            <Text style={{ fontWeight: '600', color: C.fg }}>{describeEvent(e, r.kind)}</Text>
            <Text style={s.muted}>{fmtDateTime(e.created_at)}</Text>
            {changes.map((c) => (
              <View key={c.field} style={{ marginTop: 8 }}>
                <Text style={{ fontWeight: '600', fontSize: 12, color: C.muted }}>{fieldLabel(c.field, r.kind)}</Text>
                <Text style={{ backgroundColor: '#ffebe9', color: '#82071e', padding: 6, fontSize: 13 }}>− {formatChangeValue(c.field, c.before, r.currency)}</Text>
                <Text style={{ backgroundColor: '#dafbe1', color: '#116329', padding: 6, fontSize: 13 }}>+ {formatChangeValue(c.field, c.after, r.currency)}</Text>
              </View>
            ))}
            {e.action === 'updated' && changes.length === 0 && (
              <Text style={[s.muted, { marginTop: 4 }]}>この変更は詳細な差分が記録される前のものです。</Text>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}
