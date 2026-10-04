import Link from 'next/link';
import { apiFetch, getRequestOr404 } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { saveRequestAction } from '@/lib/actions';
import RequestForm from '@/components/RequestForm';
import { KINDS, type Label, type Member, type RequestKind, type RequestType } from '@/lib/types';

export default async function NewRequestPage({ searchParams }: { searchParams: { type?: string; kind?: string; parent?: string } }) {
  const user = await requireUser();
  if (!user.can_request) {
    return <div className="notice">グループの管理者から稟議を作成する権限が付与されていません。</div>;
  }
  const [members, labels, allTypes, parent] = await Promise.all([
    apiFetch<Member[]>('/family/members'),
    apiFetch<Label[]>('/labels'),
    apiFetch<RequestType[]>('/request-types'),
    searchParams.parent ? getRequestOr404(searchParams.parent) : Promise.resolve(null),
  ]);
  const types = allTypes.filter((x) => !x.hidden);
  // 種類の指定 (?type=) がなければ、型の指定 (?kind=) の最初の種類にする。
  // 分岐するときは「その後でやること」を想定して、指定がなければ提案型にする
  const kind: RequestKind = KINDS.includes(searchParams.kind as RequestKind)
    ? (searchParams.kind as RequestKind)
    : parent ? 'activity' : 'purchase';
  const typeId = (types.find((x) => x.id === searchParams.type) ?? types.find((x) => x.base === kind) ?? types[0])?.id;
  return (
    <div style={{ maxWidth: 860 }}>
      <h1>{parent ? '稟議を分岐' : '新しいプロジェクト'}</h1>
      {parent && (
        <div className="notice">
          <Link href={`/requests/${parent.request.id}`}>「{parent.request.title}」#{parent.request.id.slice(0, 7)}</Link>{' '}
          から分岐して、新しい稟議を作ります。分岐元とリンクされ、両方の画面から行き来できます。
        </div>
      )}
      <RequestForm
        action={saveRequestAction.bind(null, null)}
        members={members}
        labels={labels}
        types={types}
        selfId={user.id}
        currency={user.family.currency}
        parentId={parent?.request.id}
        defaults={{
          type_id: typeId,
          // 分岐元と同じレビュアーを初期値にする (自分は除く)
          reviewer_ids: parent ? parent.reviewers.map((x) => x.id).filter((id) => id !== user.id) : [],
        }}
      />
    </div>
  );
}
