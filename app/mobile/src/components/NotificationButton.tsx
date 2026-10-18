import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { apiFetch } from '@/api';
import { Button } from './ui';

/** 通知の一覧を開くボタン。画面に戻るたびに未読の数を取り直す */
export function NotificationButton() {
  const [unread, setUnread] = useState(0);
  useFocusEffect(useCallback(() => {
    apiFetch<{ unread: number }>('/notifications/unread-count')
      .then((x) => setUnread(x.unread))
      .catch(() => {});
  }, []));
  return (
    <Button
      title={unread > 0 ? `🔔 ${unread > 99 ? '99+' : unread}` : '🔔'}
      variant={unread > 0 ? 'primary' : 'default'}
      size="sm"
      onPress={() => router.push('/notifications')}
    />
  );
}
