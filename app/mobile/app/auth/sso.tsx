import { useEffect } from 'react';
import { router } from 'expo-router';

/**
 * 認証サーバーから戻るディープリンク (expense://auth/sso?code=…) の受け口。
 * 結果は開いた画面 (src/ssoAuth.ts の openAuthSessionAsync) が受け取るので、
 * Android でこの画面に来たときは、すぐに元の画面へ戻す。
 */
export default function SsoRedirect() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);
  return null;
}
