import { loginAction } from '@/lib/actions';
import { ssoErrorMessage, ssoName } from '@/lib/sso-auth';
import LoginForm from './login-form';

export default async function LoginPage({ searchParams }: { searchParams: { sso_error?: string } }) {
  const sso = await ssoName();
  const ssoError = ssoErrorMessage(searchParams.sso_error, 'login', sso ?? 'SSO');
  return (
    <div style={{ maxWidth: 520, margin: '40px auto' }}>
      <div className="box">
        <div className="box-body">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={56} height={56} style={{ display: 'block', marginBottom: 12 }} />
          <h1>RingiWoMerge にログイン</h1>
          {ssoError && <div className="error">{ssoError}</div>}
          <LoginForm action={loginAction} />
          {sso && (
            <>
              <p className="muted small" style={{ textAlign: 'center', margin: '16px 0 8px' }}>または</p>
              <a href="/auth/sso/start?mode=login" className="btn" style={{ width: '100%', justifyContent: 'center' }}>
                {sso} でログイン
              </a>
              <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
                設定画面で {sso} のアカウントを連携した人だけが使えます。
              </p>
            </>
          )}
          <p className="muted" style={{ marginTop: 16, marginBottom: 0 }}>
            はじめての方は<a href="/register">新規登録</a>から、グループを作成するか招待コードで参加してください。
          </p>
        </div>
      </div>
    </div>
  );
}
