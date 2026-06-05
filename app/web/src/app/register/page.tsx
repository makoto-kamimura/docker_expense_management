import { registerAction } from '@/lib/actions';
import RegisterForm from './register-form';

export default function RegisterPage() {
  return (
    <div className="card" style={{ maxWidth: 420, margin: '40px auto' }}>
      <h1>新規登録</h1>
      <RegisterForm action={registerAction} />
    </div>
  );
}
