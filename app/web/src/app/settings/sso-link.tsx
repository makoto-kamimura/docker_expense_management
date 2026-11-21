import { apiFetch } from '@/lib/api';
import { setSsoOnlyAction, unlinkSsoAction } from '@/lib/actions';
import { ssoErrorMessage } from '@/lib/sso-auth';

type Identities = {
  sso_enabled: boolean;
  sso_name: string | null;
  can_link: boolean;
  identities: { provider: string; email: string | null; created_at: string; last_login_at: string | null }[];
  sso_only: boolean;
  login_method: 'pwd' | 'sso';
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'medium', timeStyle: 'short' });
}

/** 設定画面の「SSO でログイン」の連携欄。SSO が無効な環境では何も出さない */
export default async function SsoLink({ linked, error, ssoOnlyError }: { linked?: boolean; error?: string; ssoOnlyError?: string }) {
  let data: Identities;
  try {
    data = await apiFetch<Identities>('/me/identities');
  } catch {
    return null;
  }
  if (!data.sso_enabled) return null;
  const name = data.sso_name || 'SSO';
  const sso = data.identities.find((i) => i.provider === 'sso');
  const errorMessage = ssoErrorMessage(error, 'link', name);

  return (
    <div className="box" id="sso">
      <div className="box-head">
        <h2>{name} でログイン</h2>
        <span className="muted small">共通のアカウントと連携すると、ほかのアプリと同じログインで入れます</span>
      </div>
      <div className="box-body">
        {linked && <div className="notice">{name} のアカウントを連携しました。</div>}
        {errorMessage && <div className="error">{errorMessage}</div>}
        {sso ? (
          <div className="actions" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div>
              <strong>連携済み</strong>: {sso.email ?? `${name} のアカウント`}
              <div className="muted small">
                連携した日時: {formatDate(sso.created_at)} / 最後に {name} でログイン: {formatDate(sso.last_login_at)}
              </div>
            </div>
            <form action={unlinkSsoAction}>
              <button type="submit" className="btn-sm btn-danger">連携を解除</button>
            </form>
          </div>
        ) : data.can_link ? (
          <a href="/auth/sso/start?mode=link" className="btn">{name} のアカウントと連携する</a>
        ) : (
          <p className="muted" style={{ margin: 0 }}>デモ用のアカウントには {name} を連携できません。</p>
        )}
        {sso && (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div className="actions" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div>
                <strong>{name} だけでログインする</strong>: {data.sso_only ? 'オン' : 'オフ'}
                <div className="muted small">
                  オンにすると、メールアドレスとパスワードではログインできなくなります。ほかの端末でパスワードで入っているログインも、その時点で切れます。
                </div>
              </div>
              <form action={setSsoOnlyAction}>
                <input type="hidden" name="enabled" value={data.sso_only ? 'false' : 'true'} />
                <button
                  type="submit"
                  className={data.sso_only ? 'btn-sm' : 'btn-sm btn-primary'}
                  disabled={!data.sso_only && data.login_method !== 'sso'}
                >
                  {data.sso_only ? 'オフにする' : 'オンにする'}
                </button>
              </form>
            </div>
            {!data.sso_only && data.login_method !== 'sso' && (
              <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
                オンにするには、いったんログアウトして「{name} でログイン」で入り直してください（{name} で入れることを確かめるため）。
              </p>
            )}
            {ssoOnlyError && <div className="error" style={{ marginTop: 8 }}>{ssoOnlyError}</div>}
          </div>
        )}
        <p className="muted small" style={{ marginTop: 12, marginBottom: 0 }}>
          このアプリには、{name} にパスキーでログインした場合だけ入れます。解除すると「{name} だけ」も外れ、メールアドレスとパスワードでログインできるようになります。
        </p>
      </div>
    </div>
  );
}
