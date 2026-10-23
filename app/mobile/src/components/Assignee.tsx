import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { apiFetch } from '@/api';
import { KIND_TEXT, type Member, type RequestDetail } from '@/types';
import { C, s } from './ui';

/**
 * 稟議の担当者 (マージされたあとに動く人)。変えられる人 (申請者・レビュアー・担当者) には「変更」を出し、
 * メンバーをタップするとすぐに保存する
 */
export function AssigneeEditor({ detail, onSaved }: { detail: RequestDetail; onSaved: (d: RequestDetail) => void }) {
  const [editing, setEditing] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);
  const r = detail.request;
  const t = KIND_TEXT[r.kind];

  useEffect(() => {
    if (!editing) return;
    apiFetch<Member[]>('/family/members').then(setMembers).catch((e) => Alert.alert('読み込めませんでした', (e as Error).message));
  }, [editing]);

  const choose = async (id: string | null) => {
    setBusy(true);
    try {
      onSaved(await apiFetch<RequestDetail>(`/requests/${r.id}/assignee`, {
        method: 'PUT',
        body: JSON.stringify({ assignee_id: id }),
      }));
      setEditing(false);
    } catch (e) {
      Alert.alert('保存できませんでした', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const options = [
    { id: null as string | null, name: `${detail.requester.name} (申請者)` },
    ...members.filter((m) => m.id !== r.requester_id).map((m) => ({ id: m.id as string | null, name: m.name })),
  ];

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontWeight: '600', color: C.fg }}>担当者</Text>
        {detail.permissions.can_assign && (
          <Text style={s.link} onPress={() => setEditing(!editing)}>{editing ? 'キャンセル' : '変更'}</Text>
        )}
      </View>
      {editing ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {options.map((o) => {
            const on = o.id === r.assignee_id;
            return (
              <Pressable
                key={o.id ?? 'requester'}
                disabled={busy}
                onPress={() => choose(o.id)}
                style={[s.chip, on && s.chipOn]}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
              >
                <Text style={[s.chipText, on && s.chipTextOn]}>{on ? '✓ ' : ''}{o.name}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={{ color: C.fg, marginTop: 4 }}>
          {detail.assignee ? detail.assignee.name : `未指定 (申請者の ${detail.requester.name} が動きます)`}
        </Text>
      )}
      <Text style={[s.muted, { fontSize: 12, marginTop: 4 }]}>マージされたら、担当者が{t.actVerb}・「{t.markDone}」をします。</Text>
    </View>
  );
}
