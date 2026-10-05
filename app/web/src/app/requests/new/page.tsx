import Link from 'next/link';
import { apiFetch, getRequestOr404 } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { saveRequestAction } from '@/lib/actions';
import RequestForm, { type RequestDraft } from '@/components/RequestForm';
import { draftFromDetail } from '@/lib/request-draft';
import { KINDS, type Label, type Member, type RequestKind, type RequestType } from '@/lib/types';

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: { type?: string; kind?: string; parent?: string; copy?: string };
}) {
  const user = await requireUser();
  if (!user.can_request) {
    return <div className="notice">グループの管理者から稟議を作成する権限が付与されていません。</div>;
  }
  // 複製 (?copy=) と分岐 (?parent=) は別の機能。両方あれば複製を優先する
  const copyId = searchParams.copy;
  const parentId = copyId ? undefined : searchParams.parent;
  const [members, labels, allTypes, parent, source] = await Promise.all([
    apiFetch<Member[]>('/family/members'),
    apiFetch<Label[]>('/labels'),
    apiFetch<RequestType[]>('/request-types'),
    parentId ? getRequestOr404(parentId) : Promise.resolve(null),
    copyId ? getRequestOr404(copyId) : Promise.resolve(null),
  ]);
  const types = allTypes.filter((x) => !x.hidden);
  // 種類の指定 (?type=) がなければ、型の指定 (?kind=) の最初の種類にする。
  // 分岐するときは「その後でやること」を想定して、指定がなければ提案型にする。
  // 複製では元の種類 (非表示になっていれば同じ型の最初の種類) にする
  const kind: RequestKind = source
    ? source.request.kind
    : KINDS.includes(searchParams.kind as RequestKind)
      ? (searchParams.kind as RequestKind)
      : parent ? 'activity' : 'purchase';
  const wanted = source ? source.request.type_id : searchParams.type;
  const typeId = (types.find((x) => x.id === wanted) ?? types.find((x) => x.base === kind) ?? types[0])?.id;

  // 初期値: 複製なら元の稟議の内容 (タイトルに「（複製）」)、分岐なら分岐元と同じレビュアー。どちらもレビュアーから自分を除く
  const base: RequestDraft = source ? { ...draftFromDetail(source), title: `${source.request.title}（複製）` } : {};
  const reviewerIds = (source ?? parent)?.reviewers.map((x) => x.id).filter((id) => id !== user.id) ?? [];
  const defaults: RequestDraft = { ...base, type_id: typeId, reviewer_ids: reviewerIds };

  return (
    <div style={{ maxWidth: 860 }}>
      <h1>{source ? '稟議を複製' : parent ? '稟議を分岐' : '新しいプロジェクト'}</h1>
      {source && (
        <div className="notice">
          <Link href={`/requests/${source.request.id}`}>「{source.request.title}」#{source.request.id.slice(0, 7)}</Link>{' '}
          の内容をコピーして、新しい下書きを作ります。コメント・添付・履歴・購入の記録はコピーしません。
        </div>
      )}
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
        defaults={defaults}
      />
    </div>
  );
}
