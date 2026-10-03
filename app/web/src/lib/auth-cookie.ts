/** ログインのトークンを入れる Cookie。サーバーアクションと middleware で同じ設定を使う */
export const COOKIE_NAME = 'token';

export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  // トークン自体の期限 (最後に使ってから14日・ログインから30日) は API が決める
  maxAge: 60 * 60 * 24 * 30,
} as const;
