# 運用手順書

RingiWoMerge (稟議をマージ) のローカル起動・運用・トラブルシュート手順を記載する。仕様は [readme.md](../../readme.md) を参照する。

## システム構成

構成図・サービスとポートの一覧は、仕様書の [17.2 システム構成](../../readme.md#172-システム構成) と [17.4 Docker Compose の構成](../../readme.md#174-docker-compose-の構成) を参照。

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
| Nginx | <http://localhost:3100> | 本番想定の統合エンドポイント |
| Web | <http://localhost:3000> | Next.js 直接アクセス (開発用) |
| Backend | <http://localhost:8082> | API 直接アクセス (開発用。コンテナ内は 8080) |
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

起動時に Backend が seed する (パスワードはすべて `password123`)。**本番投入前に必ず無効化または変更すること。**

| 家族 | 名前 | メール | 権限 |
|------|------|--------|------|
| デモ家族 | パパ | dad@example.com | 申請者 / レビュアー / 管理者 |
| デモ家族 | ママ | mom@example.com | 申請者 / レビュアー |
| デモ家族 | 子ども | child@example.com | 申請者 |
| 別の家族 | おとなりさん | other@example.com | すべて（家族ごとの分離の確認用） |

新規ユーザは Web の登録画面から、家族を新しく作る (管理者になる) か招待コードで参加する。
権限は家族の管理者が Web の設定画面で変更でき、変更は即時に反映される (再ログイン不要)。

## 3. データ確認 / メンテナンス

### DB へ接続

```bash
docker compose exec db psql -U expense -d expense
```

### 主要クエリ

```sql
-- 家族ごと・状態別の申請件数
SELECT f.name, r.status, COUNT(*) FROM purchase_requests r JOIN families f ON f.id = r.family_id
GROUP BY 1, 2 ORDER BY 1, 2;

-- 月次の購入実額
SELECT DATE_TRUNC('month', purchase_date) AS month, SUM(COALESCE(actual_price, price))
FROM purchase_requests WHERE status = 'purchased' GROUP BY 1 ORDER BY 1;

-- ある申請の操作履歴
SELECT a.created_at, u.name, a.action, a.metadata FROM activities a
LEFT JOIN users u ON u.id = a.user_id WHERE a.request_id = '<id>' ORDER BY a.created_at;
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

Backend コンテナ内 `/data/uploads/<request_id>/<uuid>` (旧・経費精算の領収書は `<expense_id>/<uuid>` のまま)。Docker ボリューム `backend_uploads` に永続化される。

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
5. 領収書ストレージは将来 MinIO/S3 に切り替え予定 ([残タスク](../tasks/task.md) 参照)。

## 7. トラブルシュート

### 起動直後に Backend が DB へ繋がらない

DB が初期化中の場合がある。`db` の healthcheck が完了するまで Backend は待機する設定だが、`docker compose logs db` で `database system is ready to accept connections` を確認すること。

### ログインしても 401 が返る

- seed が走っていない可能性。`docker compose logs backend | grep seed` で確認。
- `JWT_SECRET` を変更した場合、既存の Cookie 内のトークンは無効になるためログアウト→再ログインを行う。

### 添付ファイルや申請が 404 になる

申請と添付は同じ家族のメンバーにしか見えない。下書き (Draft) は申請者本人にしか見えない。

### Web から API に届かない (ブラウザの fetch でエラー)

Web のサーバサイドからは Docker DNS で `http://backend:8080` を解決している。ブラウザから直接叩く場合は `http://localhost:8082` または Nginx 経由 `http://localhost:3100/api/...` を使用。

### Mobile から API に届かない

接続先は `EXPO_PUBLIC_API_BASE_URL` → Metro のホストの 8080 番 → `app.json` の `expo.extra.apiUrl` の順に決まる。ローカルの Compose は API を 127.0.0.1:8082 にだけ公開しているので、環境変数か `app.json` で指定する。

- iOS Simulator: `EXPO_PUBLIC_API_BASE_URL=http://localhost:8082 npx expo start`。
- Android Emulator: `http://10.0.2.2:8082` を指定。
- 実機: 端末から届く URL が必要 (Compose の API は 127.0.0.1 のみ公開なので、ポートの公開範囲を変えるか、公開デモの `https://expense.makoto-kamimura.com/api` を使う)。

### マイグレーション (スキーマ変更) を行いたい

スキーマは `app/backend/src/migrate.rs` に冪等な SQL (`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` など) で書き、
API 起動時に毎回適用される。旧・経費精算の DB は起動時に一度だけ購入申請へ変換され、旧テーブルは `legacy_*` として残る。
不要になったら手動で削除してよい:

```sql
DROP TABLE legacy_receipts, legacy_expense_items, legacy_expense_approvers, legacy_expenses, legacy_tenants;
```

## 8. ヘルスチェック

```bash
curl -s http://localhost:8082/health       # Backend
curl -s http://localhost:3000              # Web (HTMLが返ればOK)
curl -s http://localhost:3100/api/health   # Nginx 経由
```

## 9. 緊急時の対応

- **DB データ破損疑い**: 直近の `pg_dump` バックアップからリストア。
- **トークン漏洩**: `JWT_SECRET` を再生成し、全コンテナ再起動。既存セッションは全て無効化される。
- **不正アクセス**: 該当ユーザを `UPDATE users SET password_hash='!' WHERE email=...;` で即時ロック。
