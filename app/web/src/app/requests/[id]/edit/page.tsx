import { redirect } from 'next/navigation';
import { apiFetch, getRequestOr404 } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { saveRequestAction } from '@/lib/actions';
import RequestForm from '@/components/RequestForm';
import { draftFromDetail } from '@/lib/request-draft';
import type { Label, Member, RequestType } from '@/lib/types';

export default async function EditRequestPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const [d, members, labels, allTypes] = await Promise.all([
    getRequestOr404(params.id),
    apiFetch<Member[]>('/family/members'),
    apiFetch<Label[]>('/labels'),
    apiFetch<RequestType[]>('/request-types'),
  ]);
  if (!d.permissions.can_edit) redirect(`/requests/${params.id}`);
  const r = d.request;
  // 非表示にした種類は、この稟議に付いているときだけ選べる
  const types = allTypes.filter((x) => !x.hidden || x.id === r.type_id);

  return (
    <div style={{ maxWidth: 860 }}>
      <h1>稟議の編集</h1>
      {r.status === 'changes_needed' && (
        <div className="notice">コメントをもとに内容を更新し、<strong>レビューを依頼する</strong>を押してください。</div>
      )}
      <RequestForm
        action={saveRequestAction.bind(null, r.id)}
        members={members}
        labels={labels}
        types={types}
        selfId={user.id}
        currency={r.currency}
        defaults={draftFromDetail(d)}
      />
    </div>
  );
}
