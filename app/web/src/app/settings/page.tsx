import { apiFetch } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { regenerateInviteCodeAction, updateFamilyNameAction } from '@/lib/actions';
import Avatar from '@/components/Avatar';
import type { ChoresResp, Label, Member } from '@/lib/types';
import LabelSettings from './label-settings';
import MemberRoles from './member-roles';
import ChoreSettings from './chore-settings';

/** Family Settings (memo.md §20) */
export default async function SettingsPage() {
  const user = await requireUser();
  const members = await apiFetch<Member[]>('/family/members');
  const chores = user.is_admin ? (await apiFetch<ChoresResp>('/chores')).chores : [];
  const labels = user.is_admin ? await apiFetch<Label[]>('/labels') : [];

  return (
    <div style={{ maxWidth: 860 }}>
      <h1>家族の設定</h1>

      <div className="box">
        <div className="box-head"><h2>家族の名前</h2></div>
        <div className="box-body">
          {user.is_admin ? (
            <form action={updateFamilyNameAction} className="actions">
              <input name="name" defaultValue={user.family.name} required aria-label="家族の名前" style={{ flex: 1, minWidth: 200 }} />
              <button type="submit">保存</button>
            </form>
          ) : (
            <p style={{ margin: 0 }}>{user.family.name}</p>
          )}
        </div>
      </div>

      {user.is_admin && (
        <div className="box">
          <div className="box-head"><h2>家族を招待</h2></div>
          <div className="box-body">
            <div className="actions">
              <code className="invite">{user.family.invite_code}</code>
              <form action={regenerateInviteCodeAction}>
                <button type="submit" className="btn-sm">コードを再発行</button>
              </form>
            </div>
            <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
              このコードを家族に伝えてください。新規登録画面で<strong>招待コードで参加</strong>を選んで入力します。
              <br />
              再発行すると、古いコードは使えなくなります。
            </p>
          </div>
        </div>
      )}

      <div className="box">
        <div className="box-head">
          <h2>メンバー</h2>
          <span className="muted small">申請者 = 稟議を作れる / レビュアー = レビューできる / 管理者 = 家族の設定を変更できる</span>
        </div>
        {members.map((m) => (
          <div key={m.id} className="box-row" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Avatar name={m.name} large />
            <div style={{ flex: 1, minWidth: 160 }}>
              <strong>{m.name}</strong>{m.id === user.id && <span className="muted"> (あなた)</span>}
              <div className="muted small">{m.email}</div>
            </div>
            {user.is_admin ? (
              <MemberRoles member={m} isSelf={m.id === user.id} />
            ) : (
              <span className="muted">
                {[m.can_request && '申請者', m.can_review && 'レビュアー', m.is_admin && '管理者'].filter(Boolean).join(' / ')}
              </span>
            )}
          </div>
        ))}
      </div>

      {user.is_admin && (
        <div className="box" id="labels">
          <div className="box-head">
            <h2>ラベル</h2>
            <span className="muted small">稟議に付けて整理・絞り込みに使います (付け外しは申請者とレビュアー)</span>
          </div>
          <LabelSettings labels={labels} />
        </div>
      )}

      {user.is_admin && (
        <div className="box">
          <div className="box-head">
            <h2>家事の項目</h2>
            <span className="muted small">非表示にするとコミットできなくなります (過去の実績は残ります)</span>
          </div>
          <ChoreSettings chores={chores} />
        </div>
      )}
    </div>
  );
}
