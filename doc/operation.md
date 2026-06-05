# 運用手順書

経費精算管理システムのローカル起動・運用・トラブルシュート手順を記載する。

## システム構成

```
                ┌──────────────────────────────────────────┐
                │             Nginx (port 80)              │
                │   /        → web:3000                    │
                │   /api/    → backend:8080                │
                └────────────┬──────────────┬──────────────┘
                             │              │
                  ┌──────────▼─────┐   ┌────▼────────────┐
                  │ Next.js (web)  │   │ Rust API (be)   │
                  │   port 3000    │   │   port 8080     │
                  └──────────┬─────┘   └─────────┬───────┘
                             │ (server-side fetch via internal DNS)
                             │                   │
                  ┌──────────▼───────────────────▼───────┐
                  │           PostgreSQL (db)            │
                  │              port 5432               │
                  └──────────────────────────────────────┘

  Mobile (Expo) → 直接 backend:8080 (LAN/Emulator経由)
```

## 1. 起動 / 停止

### 起動 (初回)

```bash
cd platform
cp .env.example .env
docker compose up --build -d
```

主要ポート:

| サービス | URL | 用途 |
|----------|-----|------|
| Nginx | <http://localhost> | 本番想定の統合エンドポイント |
| Web | <http://localhost:3000> | Next.js 直接アクセス (開発用) |
| Backend | <http://localhost:8080> | API 直接アクセス (開発用) |
| DB | localhost:5432 | psql / GUI ツールから接続 |

### 起動 (2回目以降)

```bash
cd platform
docker compose up -d
```

### 停止

```bash
cd platform
docker compose down            # コンテナ削除 (データは残る)
docker compose down -v         # ボリュームも含めて全削除
```

## 2. 初期アカウント

起動時に Backend が seed する。**本番投入前に必ず無効化または変更すること。**

| ロール | メール | パスワード |
|--------|--------|------------|
| admin | admin@example.com | password123 |
| approver | approver@example.com | password123 |
| employee | employee@example.com | password123 |

新規ユーザは `/auth/register` (Web の「新規登録」) から作成可能。デフォルトロールは `employee`。
ロール変更は現状直接 SQL で行う:

```sql
UPDATE users SET role = 'approver' WHERE email = 'hanako@example.com';
```

## 3. データ確認 / メンテナンス

### DB へ接続

```bash
docker compose exec db psql -U expense -d expense
```

### 主要クエリ

```sql
-- 全申請の状態別件数
SELECT status, COUNT(*) FROM expenses GROUP BY status;

-- 月次の承認済み総額
SELECT DATE_TRUNC('month', incurred_on) AS month, SUM(amount_jpy)
FROM expenses WHERE status = 'approved' GROUP BY 1 ORDER BY 1;

-- 申請者別の承認待ち件数
SELECT u.name, COUNT(*) FROM expenses e JOIN users u ON u.id = e.user_id
WHERE e.status = 'submitted' GROUP BY u.name;
```

### バックアップ (手動)

```bash
docker compose exec -T db pg_dump -U expense expense > backup_$(date +%Y%m%d).sql
```

### リストア

```bash
cat backup_YYYYMMDD.sql | docker compose exec -T db psql -U expense -d expense
```

### アップロードファイルの場所

Backend コンテナ内 `/data/uploads/<expense_id>/<uuid>`。Docker ボリューム `backend_uploads` に永続化される。

```bash
# ホストからアクセス
docker compose exec backend ls -la /data/uploads
```

## 4. ログ

```bash
docker compose logs -f          # 全サービス
docker compose logs -f backend  # API のみ
docker compose logs -f web      # Web のみ
```

ログレベルは `.env` の `RUST_LOG` で調整 (例: `RUST_LOG=debug,sqlx=info`)。

## 5. 環境変数

| 変数 | デフォルト | 説明 |
|------|------------|------|
| `POSTGRES_USER` | `expense` | DB ユーザ |
| `POSTGRES_PASSWORD` | `expense` | DB パスワード |
| `POSTGRES_DB` | `expense` | DB 名 |
| `JWT_SECRET` | (要置換) | JWT 署名鍵。**本番では 32 文字以上のランダム値に必ず変更すること。** |
| `API_URL` | `http://backend:8080` | Web → Backend の内部通信先 |
| `RUST_LOG` | `info,sqlx=warn` | Rust ログレベル |

## 6. デプロイ (本番想定)

1. `.env` を本番値に置き換え (`JWT_SECRET`, `POSTGRES_PASSWORD` は必ず変更)。
2. `platform/nginx/nginx.conf` に TLS 設定 / `server_name` を追加。
3. CDN/L4LB の背後で Nginx の 80/443 を公開。
4. `docker compose pull && docker compose up -d --build` でローリング更新。
5. 領収書ストレージは将来 MinIO/S3 に切り替え予定 ([task.md](task.md) 参照)。

## 7. トラブルシュート

### 起動直後に Backend が DB へ繋がらない

DB が初期化中の場合がある。`db` の healthcheck が完了するまで Backend は待機する設定だが、`docker compose logs db` で `database system is ready to accept connections` を確認すること。

### ログインしても 401 が返る

- seed が走っていない可能性。`docker compose logs backend | grep seed` で確認。
- `JWT_SECRET` を変更した場合、既存の Cookie 内のトークンは無効になるためログアウト→再ログインを行う。

### 領収書のダウンロードが 403

承認者・管理者・本人以外はダウンロードできない仕様。ロールを確認。

### Web から API に届かない (ブラウザの fetch でエラー)

Web のサーバサイドからは Docker DNS で `http://backend:8080` を解決している。ブラウザから直接叩く場合は `http://localhost:8080` または Nginx 経由 `/api/...` を使用。

### Mobile から API に届かない

- iOS Simulator: `http://localhost:8080` で OK。
- Android Emulator: `http://10.0.2.2:8080` を `app.json` の `expo.extra.apiUrl` に設定。
- 実機: ホスト PC の LAN IP を指定 (例 `http://192.168.1.10:8080`)。

### マイグレーション (スキーマ変更) を行いたい

現状は `platform/db/init.sql` を編集して `docker compose down -v && docker compose up` でクリーン再構築。
将来的には sqlx-cli の migrate に移行予定。

## 8. ヘルスチェック

```bash
curl -s http://localhost:8080/health     # Backend
curl -s http://localhost:3000            # Web (HTMLが返ればOK)
curl -s http://localhost/api/health      # Nginx 経由
```

## 9. 緊急時の対応

- **DB データ破損疑い**: 直近の `pg_dump` バックアップからリストア。
- **トークン漏洩**: `JWT_SECRET` を再生成し、全コンテナ再起動。既存セッションは全て無効化される。
- **不正アクセス**: 該当ユーザを `UPDATE users SET password_hash='!' WHERE email=...;` で即時ロック。
