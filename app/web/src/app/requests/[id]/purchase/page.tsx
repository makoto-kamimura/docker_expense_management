import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getRequestOr404 } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { markPurchasedAction } from '@/lib/actions';
import { money } from '@/lib/format';
import { KIND_TEXT } from '@/lib/types';
import Attachments from '@/components/Attachments';
import AttachmentUpload from '@/components/AttachmentUpload';
import PurchaseForm from './purchase-form';

/** Mark as Purchased: 実際の購入情報とレシートを登録する (memo.md §17) */
export default async function PurchasePage({ params }: { params: { id: string } }) {
  await requireUser();
  const d = await getRequestOr404(params.id);
  if (!d.permissions.can_mark_purchased) redirect(`/requests/${params.id}`);
  const r = d.request;
  const receipts = d.attachments.filter((a) => a.kind === 'receipt');
  const t = KIND_TEXT[r.kind];

  return (
    <div style={{ maxWidth: 760 }}>
      <Link href={`/requests/${r.id}`} className="small">← {r.title}</Link>
      <h1 style={{ marginTop: 8 }}>{t.markDone}</h1>
      <p className="muted">承認された{t.priceShort}: {money(r.price, r.currency)}</p>

      <div className="box">
        <div className="box-head"><h2>{t.receipt}</h2></div>
        <div className="box-body">
          {receipts.length > 0 ? (
            <Attachments files={receipts} requestId={r.id} canDelete />
          ) : (
            <p className="muted" style={{ margin: 0 }}>{t.receipt}を添付できます (任意)。</p>
          )}
          <AttachmentUpload requestId={r.id} kind="receipt" label="レシートを添付" />
        </div>
      </div>

      <PurchaseForm
        action={markPurchasedAction.bind(null, r.id)}
        defaultPrice={r.price}
        defaultUrl={r.product_url ?? ''}
        currency={r.currency}
        kind={r.kind}
      />
    </div>
  );
}
