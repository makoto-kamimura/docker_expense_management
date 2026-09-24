import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { apiFetch } from '@/api';
import RequestForm, { type RequestPayload } from '@/components/RequestForm';
import { s } from '@/components/ui';
import { KINDS, type Me, type Member, type RequestDetail, type RequestKind } from '@/types';

export default function NewRequestScreen() {
  const { kind, parent } = useLocalSearchParams<{ kind?: string; parent?: string }>();
  const [parentDetail, setParentDetail] = useState<RequestDetail | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    Promise.all([apiFetch<Me>('/me'), apiFetch<Member[]>('/family/members')])
      .then(([m, list]) => {
        setMe(m);
        setMembers(list);
      })
      .catch((e) => Alert.alert('読み込めませんでした', (e as Error).message));
    if (parent) {
      apiFetch<RequestDetail>(`/requests/${parent}`)
        .then(setParentDetail)
        .catch((e) => Alert.alert('分岐元を読み込めませんでした', (e as Error).message));
    }
  }, [parent]);

  if (!me || (parent && !parentDetail)) return <View style={s.center}><ActivityIndicator /></View>;

  const onSave = async (payload: RequestPayload, submit: boolean) => {
    const d = await apiFetch<RequestDetail>('/requests', { method: 'POST', body: JSON.stringify(payload) });
    if (submit) await apiFetch(`/requests/${d.request.id}/submit`, { method: 'POST', body: '{}' });
    router.replace(`/requests/${d.request.id}`);
  };

  // 分岐するときは「その後でやりたいこと」を想定して、指定がなければ「やりたいこと」にする
  const initialKind: RequestKind = KINDS.includes(kind as RequestKind) ? (kind as RequestKind) : parent ? 'activity' : 'purchase';
  return (
    <>
      {parentDetail && (
        <Text style={{ backgroundColor: '#ddf4ff', padding: 10, fontSize: 13 }}>
          ⑂ 「{parentDetail.request.title}」#{parentDetail.request.id.slice(0, 7)} から分岐して作ります
        </Text>
      )}
      <RequestForm parentId={parentDetail?.request.id} initialKind={initialKind} members={members} selfId={me.id} currency={me.family.currency} onSave={onSave} />
    </>
  );
}
