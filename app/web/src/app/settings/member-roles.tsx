'use client';
import { useState, useTransition } from 'react';
import { updateMemberAction } from '@/lib/actions';
import type { Member } from '@/lib/types';

/** メンバーの権限をチェックボックスで切り替える (変更は即時保存) */
export default function MemberRoles({ member, isSelf }: { member: Member; isSelf: boolean }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="chips"
      onChange={(e) => {
        const fd = new FormData(e.currentTarget);
        setErr(null);
        start(async () => {
          const r = await updateMemberAction(member.id, fd);
          if (r?.error) setErr(r.error);
        });
      }}
      onSubmit={(e) => e.preventDefault()}
    >
      <label className="chip"><input type="checkbox" name="can_request" defaultChecked={member.can_request} disabled={pending} />申請者</label>
      <label className="chip"><input type="checkbox" name="can_review" defaultChecked={member.can_review} disabled={pending} />レビュアー</label>
      <label className="chip" title={isSelf ? '自分の管理者権限は外せません' : undefined}>
        <input type="checkbox" name="is_admin" defaultChecked={member.is_admin} disabled={pending || isSelf} />
        管理者
      </label>
      {/* disabled の checkbox は送信されないので、自分の Admin は hidden で維持する */}
      {isSelf && <input type="hidden" name="is_admin" value="on" />}
      {err && <span className="error" style={{ margin: 0 }}>{err}</span>}
    </form>
  );
}
