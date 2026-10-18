'use client';
import { useEffect, useState } from 'react';
import { deletePushSubscriptionAction, savePushSubscriptionAction } from '@/lib/actions';

type State = 'loading' | 'unsupported' | 'insecure' | 'install' | 'no-key' | 'denied' | 'off' | 'on';

const NOTE: Partial<Record<State, string>> = {
  unsupported: 'このブラウザは通知 (Web Push) に対応していません。',
  insecure: '通知は https で開いたときだけ使えます。',
  install: 'iPhone・iPad では、Safari の共有メニューから「ホーム画面に追加」し、ホーム画面から開くと通知を受け取れます。',
  'no-key': 'サーバーで通知の準備ができていません。',
  denied: '通知がブロックされています。ブラウザのサイトの設定で、このサイトの通知を許可してください。',
};

/** VAPID の公開鍵 (base64url) を pushManager.subscribe に渡す形にする */
function keyBytes(base64url: string): Uint8Array {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function subscriptionJson(sub: PushSubscription) {
  const j = sub.toJSON();
  return { endpoint: sub.endpoint, keys: { p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '' } };
}

/** この端末で Web Push の通知を受け取るかの切り替え */
export default function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!window.isSecureContext) return setState('insecure');
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        // iOS の Safari は、ホーム画面に追加したアプリでだけ Web Push を使える
        const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        return setState(ios ? 'install' : 'unsupported');
      }
      if (!publicKey) return setState('no-key');
      if (Notification.permission === 'denied') return setState('denied');
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // 同じブラウザで別の人がログインしたときも、今の人に届くように登録し直す
        await savePushSubscriptionAction(subscriptionJson(sub));
        setState('on');
      } else {
        setState('off');
      }
    })().catch((e) => {
      setError((e as Error).message);
      setState('unsupported');
    });
  }, [publicKey]);

  const enable = async () => {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      const r = await savePushSubscriptionAction(subscriptionJson(sub));
      if (r.error) {
        await sub.unsubscribe();
        setError(r.error);
        return;
      }
      setState('on');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState('off');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {state === 'loading' && <p className="muted" style={{ margin: 0 }}>確認しています…</p>}
      {NOTE[state] && <p className="muted" style={{ margin: 0 }}>{NOTE[state]}</p>}
      {state === 'off' && (
        <div className="actions">
          <span>この端末では通知を受け取っていません。</span>
          <button type="button" className="btn-primary" disabled={busy} onClick={enable}>この端末で通知を受け取る</button>
        </div>
      )}
      {state === 'on' && (
        <div className="actions">
          <span>この端末で通知を受け取っています。</span>
          <button type="button" disabled={busy} onClick={disable}>通知を止める</button>
        </div>
      )}
      {error && <div className="error" role="alert">{error}</div>}
    </div>
  );
}
