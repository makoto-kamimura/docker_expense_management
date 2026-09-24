import { registerAction } from '@/lib/actions';
import RegisterForm from './register-form';

export default function RegisterPage() {
  return (
    <div className="box" style={{ maxWidth: 520, margin: '40px auto' }}>
      <div className="box-body">
        <h1>新規登録</h1>
        <RegisterForm action={registerAction} />
      </div>
    </div>
  );
}
