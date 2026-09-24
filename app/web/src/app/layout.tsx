import './globals.css';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/session';
import { logoutAction } from '@/lib/actions';
import { apiFetch } from '@/lib/api';
import { Suspense } from 'react';
import Avatar from '@/components/Avatar';
import NavTabs from '@/components/NavTabs';
import Octicon from '@/components/Octicon';
import type { RequestListItem } from '@/lib/types';

export const metadata: Metadata = {
  title: 'RingiWoMerge — 稟議をマージ',
  description: '大きな買い物は、家族のレビューを通してから。家族向けの購入稟議・承認アプリ',
};

const PORTFOLIO = 'https://makoto-kamimura.com';
const isDemoMode = process.env.DEMO_MODE === 'true';
const DEMO_HOST = process.env.DEMO_HOST ?? 'expense.makoto-kamimura.com';

/**
 * Issue の投稿先はポートフォリオ側の Works（Repository URL）が持っている。
 * ここで持たないのは、デモの追加や URL 変更を管理画面だけで済ませるため。
 */
async function fetchIssuesUrl(): Promise<string> {
  try {
    const res = await fetch(
      `${PORTFOLIO}/wp-json/tty/v1/demo-banner?host=${encodeURIComponent(DEMO_HOST)}`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return '';
    const data = (await res.json()) as { issues_url?: string };
    return data.issues_url ?? '';
  } catch {
    // ポートフォリオ側が落ちていてもデモバーは出す
    return '';
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // 自分がレビューすべき申請の件数 (Review タブのバッジ)
  const toReview = user
    ? (await apiFetch<RequestListItem[]>('/requests?filter=to_review').catch(() => [])).length
    : 0;
  const issuesUrl = isDemoMode ? await fetchIssuesUrl() : '';

  return (
    <html lang="ja">
      <body style={isDemoMode ? { paddingTop: '44px' } : undefined}>
        {isDemoMode && (
          <nav id="__demo-bar" aria-label="Portfolio navigation">
            <a href={`${PORTFOLIO}/`} className="__db-title">Makoto Kamimura</a>
            <span className="__db-sep" aria-hidden="true">|</span>
            <a href={`${PORTFOLIO}/#works`} className="__db-back">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
              </svg>
              {' '}Works一覧
            </a>
            <span className="__db-sp" />
            {issuesUrl && (
              <a
                href={issuesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="__db-issues"
                title="GitHub で Issue を報告"
                aria-label="GitHub で Issue を報告"
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                </svg>
              </a>
            )}
            <span className="__db-badge">Demo</span>
          </nav>
        )}
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
