import { loginAction } from '@/lib/actions';
import LoginForm from './login-form';
import DemoAccounts from './demo-accounts';

const isDemoMode = process.env.DEMO_MODE === 'true';

// バックエンド起動時に seed される (app/backend/src/seed.rs)
const DEMO_PASSWORD = 'password123';
const DEMO_ACCOUNTS = [
  { role: 'パパ（申請者・レビュアー・管理者）', email: 'dad@example.com' },
  { role: 'ママ（申請者・レビュアー）', email: 'mom@example.com' },
  { role: '子ども（申請者）', email: 'child@example.com' },
  { role: '別の家族', email: 'other@example.com' },
];

export default function LoginPage() {
  return (
    <div style={{ maxWidth: 520, margin: '40px auto' }}>
      <div className="box">
        <div className="box-body">
          <h1>RingiWoMerge にログイン</h1>
          <LoginForm action={loginAction} />
          <p className="muted" style={{ marginTop: 16, marginBottom: 0 }}>
            はじめての方は<a href="/register">新規登録</a>から、家族を作成するか招待コードで参加してください。
          </p>
        </div>
      </div>
      {isDemoMode && (
        <div className="box">
          <div className="box-head"><h2>デモアカウント</h2></div>
          <DemoAccounts action={loginAction} accounts={DEMO_ACCOUNTS} password={DEMO_PASSWORD} />
          <div className="box-body muted" style={{ paddingTop: 8 }}>
            <strong>ログイン</strong>を押すと、その役割で試せます。パスワード: <code>{DEMO_PASSWORD}</code>
          </div>
        </div>
      )}
    </div>
  );
}
