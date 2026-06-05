# 変更履歴

リリースおよび主要な実装変更を時系列で記録する。フォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に準拠する。

## [Unreleased]

### Changed
- `app/api` を `app/backend` にリネームし、`app/{backend, web, mobile}` の3層構成に整理。
- `docker-compose.yml` と `.env.example` を `platform/` 配下へ移動。
- Web→Backend の内部通信は Docker DNS の `backend:8080` を利用する構成に統一。

### Added
- `platform/nginx/nginx.conf` を追加し、80番ポートで Web と API を統合する Nginx リバースプロキシを構成。
- `app/mobile/` に Expo Router ベースの最小モバイルアプリを追加 (ログイン / 経費一覧 / 新規申請)。
- ドキュメント `doc/task.md`, `doc/history.md`, `doc/operation.md` を新設。

## [0.1.0] - 2026-05-28

初回 MVP リリース。Web + Backend + DB が Docker Compose で起動できる最小構成。

### Added
- **インフラ**
  - Docker Compose による `db / backend / web` 3サービス構成。
  - PostgreSQL 16 のスキーマ (users, expenses, receipts) と ENUM (user_role, expense_status, expense_category)。
- **バックエンド (Rust / axum)**
  - JWT 認証 + Argon2id パスワードハッシュ。
  - 起動時の seed ユーザ投入 (admin, approver, employee / `password123`)。
  - 経費の CRUD と申請ワークフロー (draft → submitted → approved/rejected)。
  - 領収書の multipart アップロード / ダウンロード / 削除 (最大 10MB)。
  - 月次集計 API と CSV エクスポート (UTF-8)。
  - ロールベース認可 (employee / approver / admin)。
- **Web (Next.js 14 App Router / TypeScript)**
  - ログイン / 新規登録 (HttpOnly Cookie に JWT 保持)。
  - ダッシュボード、申請一覧 / 詳細 / 新規 / 編集 / 削除。
  - 承認画面、月次レポート、CSV ダウンロード。
  - 領収書アップロード用クライアントコンポーネント + 認証付きプロキシ Route Handler。

### Known issues
- 領収書ストレージは Backend コンテナのローカル volume。S3 互換 (MinIO) への差し替えは未着手。
- メール通知 / パスワードリセットは未実装。
- 単体・E2E テストは未整備。

## 記録ルール

- 機能追加・破壊的変更・修正は `Added / Changed / Deprecated / Removed / Fixed / Security` のいずれかに分類する。
- リリースを切る際は `## [x.y.z] - YYYY-MM-DD` の見出しを追加し、`Unreleased` セクションの内容を移動する。
- 関連タスクは [task.md](task.md)、運用変更は [operation.md](operation.md) も合わせて更新する。
