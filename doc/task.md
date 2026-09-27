# タスク管理

RingiWoMerge (旧: 経費精算管理システム) の実装タスクを管理する。完了済みは ✅、対応中は 🚧、未着手は ⬜ とする。

## マイルストーン 1: MVP (Web + Backend + DB) — 完了

| 状況 | カテゴリ | タスク |
|------|----------|--------|
| ✅ | インフラ | Docker Compose によるローカル一発起動 (db / backend / web / nginx) |
| ✅ | インフラ | PostgreSQL スキーマ (users / expenses / receipts) と ENUM 定義 |
| ✅ | インフラ | Nginx リバースプロキシ (80番ポートで Web と API を統合) |
| ✅ | バックエンド | Rust API (axum + sqlx + JWT) の構築 |
| ✅ | バックエンド | Argon2id パスワードハッシュ + JWT 発行 |
| ✅ | バックエンド | seed ユーザ (admin / approver / employee) の自動投入 |
| ✅ | バックエンド | 経費 CRUD + 申請 / 承認 / 却下 のワークフロー |
| ✅ | バックエンド | 領収書のアップロード / ダウンロード / 削除 |
| ✅ | バックエンド | 月次集計 (カテゴリ別件数・合計) と CSV エクスポート |
| ✅ | バックエンド | ロールベース認可 (employee / approver / admin) |
| ✅ | Web | ログイン / 登録 / ログアウト (HttpOnly Cookie) |
| ✅ | Web | ダッシュボード (自身の申請統計、承認待ち件数) |
| ✅ | Web | 申請の一覧 / 詳細 / 新規 / 編集 / 削除 |
| ✅ | Web | 承認画面 (判定メモ付き) |
| ✅ | Web | 月次レポート + CSV ダウンロード |
| ✅ | Web | 領収書アップロード / プレビュー用プロキシ |
| ✅ | Mobile | Expo (Expo Router) スカフォールド |
| ✅ | Mobile | ログイン + 自分の申請一覧 + 新規申請 |

## マイルストーン 1.5: RingiWoMerge MVP (memo.md §29) — 完了

| 状況 | カテゴリ | タスク |
|------|----------|--------|
| ✅ | バックエンド | Family / 招待コード / Requester・Reviewer・Admin 権限 |
| ✅ | バックエンド | 購入申請 CRUD と Draft → … → Merged → Purchased / Closed のワークフロー |
| ✅ | バックエンド | Comment / Request Changes / Approve / Reject / Merge / Mark as Purchased |
| ✅ | バックエンド | Activity 履歴 (誰が・いつ・何を) |
| ✅ | バックエンド | 添付 (資料 / レシート、HEIC 対応) と署名付き短時間リンク |
| ✅ | バックエンド | Dashboard 集計、旧・経費精算 DB からの自動移行 |
| ✅ | Web | 申請一覧 (フィルター) / PR 風詳細 / Summary スライド / Dashboard / Family Settings / オンボーディング |
| ✅ | Mobile | 一覧 / 作成・編集 / 詳細 (レビュー操作) / 購入登録 (レシート OCR) / Summary / Dashboard / オンボーディング |

## マイルストーン 1.6: 家事のコミット — 完了

| 状況 | カテゴリ | タスク |
|------|----------|--------|
| ✅ | バックエンド | 家事の項目 (初期セット + 管理者による追加・名前変更・非表示) |
| ✅ | バックエンド | 家事のコミット (1 日 1 回・当日の取り消し) と連続記録・マーク・草グラフの集計 |
| ✅ | バックエンド | 稟議の詳細に申請者の実績、申請時点の実績をアクティビティに記録 |
| ✅ | Web | 家事画面 / 設定の家事の項目 / 稟議詳細のサイドバーとチェックポイント |
| ✅ | Mobile | 家事画面 / 稟議詳細のカードとチェックポイント |

## マイルストーン 2: 本番化 — 未着手

| 状況 | カテゴリ | タスク |
|------|----------|--------|
| ⬜ | インフラ | TLS 終端 (Let's Encrypt + Nginx) |
| ⬜ | インフラ | S3 互換ストレージ (MinIO) への領収書保管 |
| ⬜ | インフラ | DB バックアップ & 自動リストアテスト |
| ⬜ | バックエンド | sqlx migrate への移行 (init.sql 廃止) |
| ⬜ | バックエンド | OAuth (Google / Microsoft) 連携 |
| ⬜ | バックエンド | パスワードリセット (メール送信) |
| ⬜ | バックエンド | レートリミット & CSRF |
| ⬜ | Web | フォームバリデーションの強化 (zod) |
| ⬜ | Web | i18n (ja / en) |
| ⬜ | 共通 | 通知 (New Request / Comment / Changes Requested / Approved / Merged / Purchased) |
| ⬜ | 共通 | E2E テスト (Playwright) と単体テスト整備 |
| ⬜ | 共通 | CI/CD パイプライン (lint / test / build / deploy) |

## バックログ (アイデア段階)

memo.md §21・§30 の将来機能。

- Approval Rules (金額に応じて承認不要 / 1 人 / 家族全員)
- 通貨をユーザー設定で変更 (families.currency は用意済み、現状 JPY のみ)
- Product Link から商品情報を自動取得 (SSRF 対策が必要)
- Price Tracking / Product Comparison / Budget / Recurring Cost / Warranty / Maintenance
- Family Voting (複数人の投票)
- AI Assistance (申請内容の要約・不足情報の指摘)

## トラッキング運用ルール

- タスクを追加するときは `状況` 列を `⬜` でこのファイルに追記する。
- 着手したら `🚧` に、完了したら `✅` に更新する。
- 完了タスクは [history.md](history.md) にリリース単位で転記する。
