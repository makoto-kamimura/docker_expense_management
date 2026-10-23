'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 開いている画面を、決まった間隔で読み直す (相手のコメントや操作がそのまま出るように)。
 * 画面が見えているときだけ読み直し、別のタブから戻ったときはすぐに読み直す。入力中の文章はそのまま残る
 */
export default function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const id = window.setInterval(refresh, seconds * 1000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router, seconds]);
  return null;
}
