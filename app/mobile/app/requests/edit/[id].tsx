import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { apiFetch } from '@/api';
import RequestForm, { type RequestPayload } from '@/components/RequestForm';
import { s } from '@/components/ui';
import type { Member, RequestDetail } from '@/types';

export default function EditRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    Promise.all([apiFetch<RequestDetail>(`/requests/${id}`), apiFetch<Member[]>('/family/members')])
      .then(([d, list]) => {
        setDetail(d);
        setMembers(list);
      })
      .catch((e) => Alert.alert('読み込めませんでした', (e as Error).message));
  }, [id]);

  if (!detail) return <View style={s.center}><ActivityIndicator /></View>;

  const onSave = async (payload: RequestPayload, submit: boolean) => {
    await apiFetch(`/requests/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    if (submit) await apiFetch(`/requests/${id}/submit`, { method: 'POST', body: '{}' });
    router.back();
  };

  return (
    <RequestForm
      initial={detail}
      members={members}
      selfId={detail.request.requester_id}
      currency={detail.request.currency}
      onSave={onSave}
    />
  );
}
