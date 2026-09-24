import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { apiFetch } from '@/api';
import { labelTextColor, type Label, type RequestDetail } from '@/types';
import { Button, C, s } from './ui';

/** GitHub のラベルと同じ、色付きの丸いラベル */
export function LabelChip({ label, dim }: { label: Label; dim?: boolean }) {
  return (
    <Text
      style={{
        backgroundColor: label.color, color: labelTextColor(label.color), opacity: dim ? 0.35 : 1,
        borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1, fontSize: 12, fontWeight: '500', overflow: 'hidden',
      }}
    >
      {label.name}
    </Text>
  );
}

export function LabelList({ labels }: { labels: Label[] }) {
  if (labels.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
      {labels.map((l) => <LabelChip key={l.id} label={l} />)}
    </View>
  );
}

/**
 * 稟議のラベル。付け外しできる人 (申請者とレビュアー) には「編集」を出し、
 * 家族のラベルをタップで選んで保存する。
 */
export function LabelEditor({ detail, onSaved }: { detail: RequestDetail; onSaved: (d: RequestDetail) => void }) {
  const [editing, setEditing] = useState(false);
  const [all, setAll] = useState<Label[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const current = detail.labels.map((l) => l.id);

  useEffect(() => {
    if (!editing) return;
    setChecked(current);
    apiFetch<Label[]>('/labels').then(setAll).catch((e) => Alert.alert('読み込めませんでした', (e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const save = async () => {
    setBusy(true);
    try {
      onSaved(await apiFetch<RequestDetail>(`/requests/${detail.request.id}/labels`, {
        method: 'PUT',
        body: JSON.stringify({ label_ids: checked }),
      }));
      setEditing(false);
    } catch (e) {
      Alert.alert('保存できませんでした', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontWeight: '600', color: C.fg }}>ラベル</Text>
        {detail.permissions.can_label && (
          <Text style={s.link} onPress={() => setEditing(!editing)}>{editing ? 'キャンセル' : '編集'}</Text>
        )}
      </View>
      {editing ? (
        <View style={{ gap: 8, marginTop: 6 }}>
          <Text style={[s.muted, { fontSize: 12 }]}>タップで付け外しして、保存してください。</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {all.map((l) => {
              const on = checked.includes(l.id);
              return (
                <Pressable
                  key={l.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => setChecked((c) => (on ? c.filter((x) => x !== l.id) : [...c, l.id]))}
                >
                  <LabelChip label={{ ...l, name: `${on ? '✓ ' : ''}${l.name}` }} dim={!on} />
                </Pressable>
              );
            })}
            {all.length === 0 && <Text style={s.muted}>ラベルがありません (Web の設定画面で追加できます)。</Text>}
          </View>
          <Button title="保存" variant="primary" busy={busy} onPress={save} />
        </View>
      ) : detail.labels.length === 0 ? (
        <Text style={[s.muted, { marginTop: 4 }]}>ラベルはありません</Text>
      ) : (
        <LabelList labels={detail.labels} />
      )}
    </View>
  );
}
