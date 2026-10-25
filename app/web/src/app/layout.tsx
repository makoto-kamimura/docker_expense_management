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
  // 自分がレビューすべき申請の件数 (Review タブのバッジ) と、未読の通知の数 (ベル)
  const [toReview, unread] = user
    ? await Promise.all([
        apiFetch<RequestListItem[]>('/requests?filter=to_review').then((x) => x.length).catch(() => 0),
        apiFetch<{ unread: number }>('/notifications/unread-count').then((x) => x.unread).catch(() => 0),
      ])
    : [0, 0];

  return (
    <html lang="ja" data-theme={theme === 'system' ? undefined : theme}>
      <head>
        {/*
          絵文字のデザインを、端末によらず Noto Color Emoji にそろえる (globals.css の font-family の最後で使う)。
          ブラウザごとに合う形式 (Safari 向けなど) を Google Fonts が選ぶので、ビルド時に取り込まずにここで読み込む
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap" />
      </head>
      <body>
        <header className="header">
          <div className="header-inner" style={user ? undefined : { paddingBottom: 16 }}>
            <div className="header-top">
              <a href="/" className="brand" aria-label="RingiWoMerge ホーム">
                <span className="brand-mark"><Octicon name="merge" /></span>
              </a>
              <div className="crumbs">
                {user && (
                  <span className="crumb-family">
                    <a href="/settings" style={{ color: 'inherit' }}>{user.family.name}</a>
                    <span className="sep"> / </span>
                  </span>
                )}
                <a href="/" style={{ color: 'inherit' }}><strong>RingiWoMerge</strong></a>
              </div>
              <div className="who">
                <ThemeSwitch initial={theme} />
                {user ? (
                  <>
                    <a
                      href="/notifications"
                      className={`bell${unread ? ' bell-on' : ''}`}
                      aria-label={unread ? `通知 (未読 ${unread}件)` : '通知'}
                      title="通知"
                    >
                      <Octicon name="bell" />
                      {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
                    </a>
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
