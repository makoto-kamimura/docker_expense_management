import { loginAction } from '@/lib/actions';
import LoginForm from './login-form';

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
    </div>
  );
}
