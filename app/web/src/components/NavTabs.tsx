'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

/** GitHub の UnderlineNav 風タブ。現在地を下線で示す。 */
export default function NavTabs({ toReview }: { toReview: number }) {
  const path = usePathname();
  const filter = useSearchParams().get('filter');
  const tabs = [
    { href: '/dashboard', label: 'ダッシュボード', on: path.startsWith('/dashboard') },
    { href: '/', label: '稟議', on: (path === '/' && filter !== 'to_review') || path.startsWith('/requests') },
    { href: '/?filter=to_review', label: 'レビュー', on: path === '/' && filter === 'to_review', count: toReview },
    { href: '/chores', label: 'マイページ', on: path.startsWith('/chores') },
    { href: '/settings', label: '設定', on: path.startsWith('/settings') },
  ];
  return (
    <nav className="underline-nav" aria-label="メインメニュー">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={t.on ? 'selected' : ''} aria-current={t.on ? 'page' : undefined}>
          {t.label}
          {t.count ? <span className="counter">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
