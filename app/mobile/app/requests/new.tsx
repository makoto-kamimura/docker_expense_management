import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { apiFetch } from '@/api';
import RequestForm, { type RequestPayload } from '@/components/RequestForm';
import { C, s } from '@/components/ui';
import { KINDS, type Me, type Member, type RequestDetail, type RequestKind } from '@/types';
import { useTheme } from '@/theme';

export default function NewRequestScreen() {
  useTheme();
  const params = useLocalSearchParams<{ kind?: string; type?: string; parent?: string; copy?: string }>();
  const { kind, type, copy } = params;
  // 複製 (?copy=) と分岐 (?parent=) は別の機能。両方あれば複製を優先する
  const parent = copy ? undefined : params.parent;
  const [parentDetail, setParentDetail] = useState<RequestDetail | null>(null);
  const [source, setSource] = useState<RequestDetail | null>(null);
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
    if (copy) {
      apiFetch<RequestDetail>(`/requests/${copy}`)
        .then(setSource)
        .catch((e) => Alert.alert('複製元を読み込めませんでした', (e as Error).message));
    }
  }, [parent, copy]);

  if (!me || (parent && !parentDetail) || (copy && !source)) return <View style={s.center}><ActivityIndicator /></View>;
  // 複製の初期値: タイトルに「（複製）」を付け、レビュアーから自分を除く
  const initial: RequestDetail | undefined = source
    ? {
        ...source,
        request: { ...source.request, title: `${source.request.title}（複製）` },
        reviewers: source.reviewers.filter((x) => x.id !== me.id),
      }
    : undefined;

  const onSave = async (payload: RequestPayload, submit: boolean) => {
    const d = await apiFetch<RequestDetail>('/requests', { method: 'POST', body: JSON.stringify(payload) });
    if (submit) await apiFetch(`/requests/${d.request.id}/submit`, { method: 'POST', body: '{}' });
    router.replace(`/requests/${d.request.id}`);
  };

  // 分岐するときは「その後でやること」を想定して、指定がなければ提案型にする
  const initialKind: RequestKind = KINDS.includes(kind as RequestKind) ? (kind as RequestKind) : parent ? 'activity' : 'purchase';
  return (
    <>
      {source && (
        <Text style={{ backgroundColor: C.accentSubtle, color: C.fg, padding: 10, fontSize: 13 }}>
          「{source.request.title}」#{source.request.id.slice(0, 7)} の内容をコピーして、新しい下書きを作ります。コメント・添付・履歴・購入の記録はコピーしません。
        </Text>
      )}
      {parentDetail && (
        <Text style={{ backgroundColor: C.accentSubtle, color: C.fg, padding: 10, fontSize: 13 }}>
          ⑂ 「{parentDetail.request.title}」#{parentDetail.request.id.slice(0, 7)} から分岐して作ります
        </Text>
      )}
      <RequestForm initial={initial} copy={!!source} parentId={parentDetail?.request.id} initialKind={initialKind} initialTypeId={type} members={members} selfId={me.id} currency={me.family.currency} onSave={onSave} />
    </>
  );
}
