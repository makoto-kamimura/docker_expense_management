import type { MetadataRoute } from 'next';

/** ホーム画面に追加できるようにする (iOS は、ホーム画面に追加したときだけ Web Push を受け取れる) */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RingiWoMerge — 稟議をマージ',
    short_name: 'RingiWoMerge',
    description: '大きな買い物は、グループのレビューを通してから。',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#f6f8fa',
    lang: 'ja',
    icons: [{ src: '/icon.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' }],
  };
}
