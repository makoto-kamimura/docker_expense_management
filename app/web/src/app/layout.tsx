import './globals.css';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/session';
import { logoutAction } from '@/lib/actions';
import { ROLE_LABEL } from '@/lib/types';

export const metadata: Metadata = {
  title: '経費精算管理システム',
  description: 'Expense management',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const canApprove = user && (user.role === 'approver' || user.role === 'admin');

  return (
    <html lang="ja">
      <body>
        <nav className="nav">
          <div className="links">
            <a href="/" style={{ fontWeight: 700 }}>経費精算</a>
            {user && (
              <>
                <a href="/expenses">申請一覧</a>
                <a href="/expenses/new">新規申請</a>
                {canApprove && <a href="/approvals">承認</a>}
                <a href="/reports">集計/CSV</a>
              </>
            )}
          </div>
          <div className="links">
            {user ? (
              <>
                <span className="who">
                  {user.name} ({ROLE_LABEL[user.role]})
                </span>
                <form action={logoutAction}>
                  <button className="secondary" type="submit">
                    ログアウト
                  </button>
                </form>
              </>
            ) : (
              <>
                <a href="/login">ログイン</a>
                <a href="/register">登録</a>
              </>
            )}
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
