import './globals.css';
import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/session';
import { logoutAction } from '@/lib/actions';
import { apiFetch } from '@/lib/api';
import { Suspense } from 'react';
import Avatar from '@/components/Avatar';
import NavTabs from '@/components/NavTabs';
import ThemeSwitch from '@/components/ThemeSwitch';
import { THEME_COOKIE, parseTheme } from '@/lib/theme';
import Octicon from '@/components/Octicon';
import type { RequestListItem } from '@/lib/types';

export const metadata: Metadata = {
  title: 'RingiWoMerge — 稟議をマージ',
  description: '大きな買い物は、グループのレビューを通してから。グループ向けの購入稟議・承認アプリ',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // 表示の設定はサーバー側で html に付けて、読み込み時に色が切り替わって見えないようにする
  const theme = parseTheme(cookies().get(THEME_COOKIE)?.value);
  // 自分がレビューすべき申請の件数 (Review タブのバッジ)
  const toReview = user
    ? (await apiFetch<RequestListItem[]>('/requests?filter=to_review').catch(() => [])).length
    : 0;

  return (
    <html lang="ja" data-theme={theme === 'system' ? undefined : theme}>
      <body>
        <header className="header">
          <div className="header-inner" style={user ? undefined : { paddingBottom: 16 }}>
            <div className="header-top">
              <a href="/" className="brand" aria-label="RingiWoMerge ホーム">
                <span className="brand-mark"><Octicon name="merge" /></span>
              </a>
              <div className="crumbs">
                {user && (
                  <>
                    <a href="/settings" style={{ color: 'inherit' }}>{user.family.name}</a>
                    <span className="sep">/</span>
                  </>
                )}
                <a href="/" style={{ color: 'inherit' }}><strong>RingiWoMerge</strong></a>
              </div>
              <div className="who">
                <ThemeSwitch initial={theme} />
                {user ? (
                  <>
                    <Avatar name={user.name} />
                    <span className="muted">{user.name}</span>
                    <form action={logoutAction}>
                      <button type="submit" className="btn-sm">ログアウト</button>
                    </form>
                  </>
                ) : (
                  <>
                    <a href="/login">ログイン</a>
                    <a href="/register" className="btn btn-sm">新規登録</a>
                  </>
                )}
              </div>
            </div>
            {user && (
              <Suspense>
                <NavTabs toReview={toReview} />
              </Suspense>
            )}
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
