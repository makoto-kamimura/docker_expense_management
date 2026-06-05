import { loginAction } from '@/lib/actions';
import LoginForm from './login-form';

export default function LoginPage() {
  return (
    <div className="card" style={{ maxWidth: 420, margin: '40px auto' }}>
      <h1>ログイン</h1>
      <LoginForm action={loginAction} />
      <p className="muted" style={{ marginTop: 16 }}>
        アカウントがない場合は <a href="/register">登録</a> へ。
      </p>
    </div>
  );
}
