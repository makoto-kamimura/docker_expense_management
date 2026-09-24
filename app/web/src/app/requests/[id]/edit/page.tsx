import { redirect } from 'next/navigation';
import { apiFetch, getRequestOr404 } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { saveRequestAction } from '@/lib/actions';
import RequestForm from '@/components/RequestForm';
import type { Label, Member } from '@/lib/types';

export default async function EditRequestPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const [d, members, labels] = await Promise.all([
    getRequestOr404(params.id),
    apiFetch<Member[]>('/family/members'),
    apiFetch<Label[]>('/labels'),
  ]);
  if (!d.permissions.can_edit) redirect(`/requests/${params.id}`);
  const r = d.request;

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
        selfId={user.id}
        currency={r.currency}
        defaults={{
          kind: r.kind,
          title: r.title,
          reason: r.reason,
          price: r.price,
          seller: r.seller,
          product_name: r.product_name,
          product_url: r.product_url,
          label_ids: d.labels.map((l) => l.id),
          planned_date: r.planned_date,
          end_date: r.end_date,
          notes: r.notes,
          reviewer_ids: d.reviewers.map((x) => x.id),
          alternatives: d.alternatives.map((a) => ({
            name: a.name,
            price: a.price == null ? '' : String(a.price),
            url: a.url ?? '',
            notes: a.notes ?? '',
          })),
        }}
      />
    </div>
  );
}
