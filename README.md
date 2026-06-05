# 経費精算管理システム

[doc/design.md](doc/design.md) の技術要件に基づく経費精算管理システム。

## 技術スタック

| 役割 | 技術 |
|------|------|
| Web | Next.js 14 (App Router) + TypeScript |
| Mobile | Expo (Expo Router) + TypeScript |
| API | Rust (axum + sqlx) |
| DB | PostgreSQL 16 |
| Auth | JWT + Argon2id |
| Reverse Proxy | Nginx |
| Infra | Docker / Docker Compose |
| Storage | API ローカル volume (S3 互換差し替えは [task.md](doc/task.md) を参照) |

## ディレクトリ構成

```
.
├── app/                      # アプリのソースコード
│   ├── backend/              # Rust API (axum + sqlx) ※ソースのみ
│   ├── web/                  # Next.js Web (App Router) ※ソースのみ
│   └── mobile/               # Expo モバイルアプリ
├── platform/                 # インフラ / Docker 設定を集約
│   ├── docker-compose.yml
│   ├── .env.example
│   ├── backend/Dockerfile    # API イメージ定義
│   ├── web/Dockerfile        # Web イメージ定義
│   ├── db/init.sql           # PostgreSQL スキーマ
│   └── nginx/nginx.conf      # Nginx リバースプロキシ
├── doc/
│   ├── design.md         # 技術要件
│   ├── task.md           # タスク管理
│   ├── history.md        # 変更履歴
│   └── operation.md      # 運用手順書
└── README.md
```

## クイックスタート

```bash
cd platform
cp .env.example .env
docker compose up --build -d
```

| URL | 説明 |
|-----|------|
| <http://localhost>      | Nginx 経由 (本番想定の入口) |
| <http://localhost:3000> | Web 直接 (開発用) |
| <http://localhost:8080> | API 直接 (開発用) |

詳しい運用手順は [doc/operation.md](doc/operation.md) を参照。

## 初期アカウント

| ロール | メール | パスワード |
|--------|--------|------------|
| 管理者 (admin) | admin@example.com | password123 |
| 承認者 (approver) | approver@example.com | password123 |
| 社員 (employee) | employee@example.com | password123 |

API 起動時に Argon2id ハッシュで自動投入されます。**本番投入前に必ず変更/無効化してください。**

## モバイルアプリ

```bash
cd app/mobile
npm install
npm run start
```

API URL は `app/mobile/app.json` の `expo.extra.apiUrl` を環境に合わせて変更してください
(iOS Simulator: `http://localhost:8080`、Android Emulator: `http://10.0.2.2:8080`、実機: ホスト LAN IP)。

## ドキュメント

- [doc/design.md](doc/design.md) — 技術要件
- [doc/task.md](doc/task.md) — タスク管理
- [doc/history.md](doc/history.md) — 変更履歴
- [doc/operation.md](doc/operation.md) — 運用手順書
