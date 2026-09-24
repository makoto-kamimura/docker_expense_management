/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  experimental: {
    // 添付・家事の見本画像はサーバーアクション経由で API に送る。既定の 1MB だとスマホの写真が送れないため、
    // API の上限 (10MB + multipart の区切り) に合わせる
    serverActions: { bodySizeLimit: '12mb' },
  },
};

export default nextConfig;
