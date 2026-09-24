'use client';
import { useState, useTransition } from 'react';
import { KIND_TEXT, type RequestKind } from '@/lib/types';

export default function PurchaseForm({
  action,
  defaultPrice,
  defaultUrl,
  currency,
  kind,
}: {
  action: (fd: FormData) => Promise<{ error?: string }>;
  defaultPrice: number;
  defaultUrl: string;
  currency: string;
  kind: RequestKind;
}) {
  const t = KIND_TEXT[kind];
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // 日本時間の今日
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  return (
    <form
      className="box"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const r = await action(fd);
          if (r?.error) setError(r.error);
        });
      }}
    >
      <div className="box-head"><h2>{t.record}</h2></div>
      <div className="box-body">
        {error && <div className="error">{error}</div>}
        <div className="form-grid">
          <div className="row">
            <label htmlFor="actual_price">{t.actualPrice}<span className="req">*</span><span className="hint">{currency === 'JPY' ? '円' : currency}</span></label>
            <input id="actual_price" name="actual_price" type="number" min={0} required defaultValue={defaultPrice} />
          </div>
          <div className="row">
            <label htmlFor="purchase_date">{t.doneDate}<span className="req">*</span></label>
            <input id="purchase_date" name="purchase_date" type="date" required defaultValue={today} />
          </div>
        </div>
        <div className="form-grid">
          <div className="row">
            <label htmlFor="order_number">{t.orderNo}</label>
            <input id="order_number" name="order_number" />
          </div>
          <div className="row">
            <label htmlFor="final_product_url">{t.finalUrl}</label>
            <input id="final_product_url" name="final_product_url" type="url" pattern="https?://.+" defaultValue={defaultUrl} />
          </div>
        </div>
        <div className="actions" style={{ justifyContent: 'flex-end' }}>
          <button type="submit" className="btn-blue" disabled={pending}>{pending ? '保存中…' : t.markDone}</button>
        </div>
      </div>
    </form>
  );
}
