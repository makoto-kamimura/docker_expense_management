use sqlx::{Executor, PgPool};
use uuid::Uuid;

use crate::handlers::{chores, labels};

/// RingiWoMerge のスキーマ。すべて冪等に書き、API 起動のたびに流す。
/// (platform/db/init.sql は拡張の有効化のみ。スキーマの正はこのファイル)
const SCHEMA_SQL: &str = r#"
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
    CREATE TYPE request_status AS ENUM (
        'draft', 'submitted', 'under_review', 'changes_needed',
        'approved', 'merged', 'purchased', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE TYPE request_category AS ENUM ('home', 'electronics', 'hobby', 'travel', 'education', 'other', 'leisure', 'dining');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- 既存 DB 向け (未使用のうちに追加するだけなのでトランザクション内でも安全)
ALTER TYPE request_category ADD VALUE IF NOT EXISTS 'leisure';
ALTER TYPE request_category ADD VALUE IF NOT EXISTS 'dining';
-- 稟議の種類: purchase = 買いたいもの / outing = 行きたいところ
DO $$ BEGIN
    CREATE TYPE request_kind AS ENUM ('purchase', 'outing', 'activity');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- activity = やりたいこと (習い事・体験など)
ALTER TYPE request_kind ADD VALUE IF NOT EXISTS 'activity';
DO $$ BEGIN
    CREATE TYPE reviewer_decision AS ENUM ('pending', 'approved', 'changes_requested', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE TYPE attachment_kind AS ENUM ('evidence', 'receipt');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $f$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$f$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS families (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    invite_code  TEXT NOT NULL UNIQUE,
    currency     TEXT NOT NULL DEFAULT 'JPY',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

-- 1 ユーザーは 1 家族に所属する (将来の複数所属に備えて中間テーブルにしている)
CREATE TABLE IF NOT EXISTS family_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id   UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    can_request BOOLEAN NOT NULL DEFAULT TRUE,
    can_review  BOOLEAN NOT NULL DEFAULT TRUE,
    is_admin    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_family_members_family ON family_members(family_id);

CREATE TABLE IF NOT EXISTS purchase_requests (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id         UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    requester_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title             TEXT NOT NULL,
    reason            TEXT NOT NULL DEFAULT '',
    price             BIGINT NOT NULL CHECK (price >= 0),
    currency          TEXT NOT NULL DEFAULT 'JPY',
    seller            TEXT NOT NULL DEFAULT '',
    product_name      TEXT,
    product_url       TEXT,
    category          request_category NOT NULL DEFAULT 'other',
    planned_date      DATE,
    notes             TEXT,
    status            request_status NOT NULL DEFAULT 'draft',
    submitted_at      TIMESTAMPTZ,
    approved_at       TIMESTAMPTZ,
    merged_at         TIMESTAMPTZ,
    merged_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    purchased_at      TIMESTAMPTZ,
    purchase_date     DATE,
    actual_price      BIGINT CHECK (actual_price >= 0),
    order_number      TEXT,
    final_product_url TEXT,
    closed_at         TIMESTAMPTZ,
    close_reason      TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- お出かけの稟議では product_name = 行き先、planned_date = 行く日、end_date = 帰る日、seller = 予約先として使う
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS kind     request_kind NOT NULL DEFAULT 'purchase';
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS end_date DATE;
-- 分岐元の稟議 (「この稟議の後でやりたいこと」などを派生させたとき)
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES purchase_requests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_requests_parent ON purchase_requests(parent_id);
CREATE INDEX IF NOT EXISTS idx_requests_family    ON purchase_requests(family_id);
CREATE INDEX IF NOT EXISTS idx_requests_requester ON purchase_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_requests_status    ON purchase_requests(status);

CREATE TABLE IF NOT EXISTS request_reviewers (
    request_id UUID NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    decision   reviewer_decision NOT NULL DEFAULT 'pending',
    decided_at TIMESTAMPTZ,
    PRIMARY KEY (request_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_request_reviewers_user ON request_reviewers(user_id);

CREATE TABLE IF NOT EXISTS alternative_products (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
    position   INT NOT NULL,
    name       TEXT NOT NULL,
    price      BIGINT CHECK (price >= 0),
    url        TEXT,
    notes      TEXT
);
CREATE INDEX IF NOT EXISTS idx_alternatives_request ON alternative_products(request_id);

CREATE TABLE IF NOT EXISTS attachments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id   UUID NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
    kind         attachment_kind NOT NULL DEFAULT 'evidence',
    file_name    TEXT NOT NULL,
    content_type TEXT NOT NULL,
    byte_size    BIGINT NOT NULL,
    storage_key  TEXT NOT NULL,
    uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attachments_request ON attachments(request_id);

CREATE TABLE IF NOT EXISTS comments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
    user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    body       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comments_request ON comments(request_id);

-- 誰が・いつ・何をしたか (Activity 欄)
CREATE TABLE IF NOT EXISTS activities (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
    user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    action     TEXT NOT NULL,
    metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activities_request ON activities(request_id);

-- リンク先ページのプレビュー (OGP / JSON-LD の画像とタイトル) のキャッシュ。URL ごとに 1 行
CREATE TABLE IF NOT EXISTS link_previews (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url        TEXT NOT NULL UNIQUE,
    status     TEXT NOT NULL,           -- ok / failed
    title      TEXT,
    site_name  TEXT,
    image_key  TEXT,                    -- UPLOAD_DIR 配下の保存先
    image_type TEXT,
    error      TEXT,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 家事 (掃除・洗濯など) と、その日にやったことの記録 (コミット)。1 つの家事は 1 人 1 日 1 回
CREATE TABLE IF NOT EXISTS chores (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id  UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    icon       TEXT NOT NULL DEFAULT '🏠',
    position   INT NOT NULL DEFAULT 0,
    archived   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chores_family ON chores(family_id);
-- 家事の説明。追加前からある行は NULL になり、起動時に初期の説明 (なければ空文字) で埋める
ALTER TABLE chores ADD COLUMN IF NOT EXISTS description TEXT;
-- 所要時間 (分) と推奨頻度 (期間 day / week / month あたり何回)。どちらも未入力は NULL
ALTER TABLE chores ADD COLUMN IF NOT EXISTS duration_minutes INT CHECK (duration_minutes BETWEEN 1 AND 1440);
ALTER TABLE chores ADD COLUMN IF NOT EXISTS frequency_period TEXT CHECK (frequency_period IN ('day', 'week', 'month'));
ALTER TABLE chores ADD COLUMN IF NOT EXISTS frequency_times  INT CHECK (frequency_times BETWEEN 1 AND 31);

CREATE TABLE IF NOT EXISTS chore_commits (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chore_id     UUID NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    committed_on DATE NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (chore_id, user_id, committed_on)
);
CREATE INDEX IF NOT EXISTS idx_chore_commits_user ON chore_commits(user_id, committed_on);

-- プッシュ = 家事をすべてクリアしたことの確定。トロフィーとして残り、取り消せない。
-- scope ごと (all = 今日すべて / day = 毎日の家事 / week = 週の家事 / month = 月の家事) に、期間 1 回まで
CREATE TABLE IF NOT EXISTS chore_pushes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id   UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pushed_on   DATE NOT NULL,
    -- プッシュした時点の家事の数 (後で家事が増えても、その日に何件やったかがわかるように)
    chore_count INT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chore_pushes_family ON chore_pushes(family_id);
-- 既存 DB 向け: 以前は「今日すべて」だけで 1 人 1 日 1 回だった
ALTER TABLE chore_pushes ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'all';
-- 対象の期間の初日 (all / day = その日、week = 日曜、month = 1 日)
ALTER TABLE chore_pushes ADD COLUMN IF NOT EXISTS period_start DATE;
UPDATE chore_pushes SET period_start = pushed_on WHERE period_start IS NULL;
ALTER TABLE chore_pushes ALTER COLUMN period_start SET NOT NULL;
ALTER TABLE chore_pushes DROP CONSTRAINT IF EXISTS chore_pushes_user_id_pushed_on_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_chore_pushes_period ON chore_pushes(user_id, scope, period_start);

-- 家事の見本画像 (きれいな状態 = 保つべき状態)。実体は UPLOAD_DIR/chores/<chore_id>/ に置く
CREATE TABLE IF NOT EXISTS chore_images (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chore_id     UUID NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
    file_name    TEXT NOT NULL,
    content_type TEXT NOT NULL,
    byte_size    BIGINT NOT NULL,
    storage_key  TEXT NOT NULL,
    caption      TEXT NOT NULL DEFAULT '',
    position     INT NOT NULL DEFAULT 0,
    uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chore_images_chore ON chore_images(chore_id);

-- ラベル (家族ごと。稟議に複数付けられる)。初期ラベルは families.labels_seeded で一度だけ入れる
ALTER TABLE families ADD COLUMN IF NOT EXISTS labels_seeded BOOLEAN NOT NULL DEFAULT FALSE;
-- カテゴリ (purchase_requests.category) をラベルに移したか。以後カテゴリの列は使わず、ラベルで分類する
ALTER TABLE families ADD COLUMN IF NOT EXISTS category_labels_migrated BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS labels (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id   UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#8250df',
    description TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_labels_family_name ON labels(family_id, lower(name));
CREATE TABLE IF NOT EXISTS request_labels (
    request_id UUID NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
    label_id   UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (request_id, label_id)
);
CREATE INDEX IF NOT EXISTS idx_request_labels_label ON request_labels(label_id);

CREATE OR REPLACE TRIGGER trg_families_updated_at BEFORE UPDATE ON families
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_requests_updated_at BEFORE UPDATE ON purchase_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_comments_updated_at BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
"#;

/// 旧・経費精算アプリの DB を、テナント導入後の形にそろえる。
/// (テナント導入前のままの DB もあるため、変換の前段として流す)
const LEGACY_TENANT_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS tenants (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    invite_code  TEXT NOT NULL UNIQUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
DO $$
DECLARE t UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM users WHERE tenant_id IS NULL)
       OR EXISTS (SELECT 1 FROM expenses WHERE tenant_id IS NULL) THEN
        SELECT id INTO t FROM tenants ORDER BY created_at LIMIT 1;
        IF t IS NULL THEN
            INSERT INTO tenants (name, invite_code)
            VALUES ('デモ家族', upper(encode(gen_random_bytes(5), 'hex')))
            RETURNING id INTO t;
        END IF;
        UPDATE users SET tenant_id = t WHERE tenant_id IS NULL;
        UPDATE expenses e SET tenant_id = u.tenant_id
          FROM users u WHERE u.id = e.user_id AND e.tenant_id IS NULL;
    END IF;
END $$;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS purpose TEXT;
CREATE TABLE IF NOT EXISTS expense_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    position INT NOT NULL, name TEXT NOT NULL, quantity INT NOT NULL,
    unit_price_jpy BIGINT NOT NULL, url TEXT, vendor TEXT
);
CREATE TABLE IF NOT EXISTS expense_approvers (
    expense_id  UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    approver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (expense_id, approver_id)
);
INSERT INTO expense_approvers (expense_id, approver_id)
SELECT e.id, u.id
  FROM expenses e
  JOIN users u ON u.tenant_id = e.tenant_id AND u.role IN ('approver', 'admin') AND u.id <> e.user_id
 WHERE e.status <> 'draft'
   AND NOT EXISTS (SELECT 1 FROM expense_approvers a WHERE a.expense_id = e.id)
ON CONFLICT DO NOTHING;
"#;

/// 経費精算のデータを RingiWoMerge の購入申請へ移し、旧テーブルは legacy_* に退避する。
const LEGACY_CONVERT_SQL: &str = r#"
INSERT INTO families (id, name, invite_code, created_at)
SELECT id, name, invite_code, created_at FROM tenants
ON CONFLICT DO NOTHING;

-- 旧ロール: employee = 申請のみ / approver = 申請+レビュー / admin = すべて
INSERT INTO family_members (family_id, user_id, can_request, can_review, is_admin)
SELECT tenant_id, id, TRUE, role IN ('approver', 'admin'), role = 'admin' FROM users
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO purchase_requests (
    id, family_id, requester_id, title, reason, price, seller, product_url, category,
    planned_date, notes, status, submitted_at, approved_at, closed_at, close_reason,
    created_at, updated_at)
SELECT e.id, e.tenant_id, e.user_id, e.title,
       COALESCE(e.purpose, e.description, ''),
       e.amount_jpy,
       COALESCE((SELECT i.vendor FROM expense_items i WHERE i.expense_id = e.id ORDER BY i.position LIMIT 1), ''),
       (SELECT i.url FROM expense_items i WHERE i.expense_id = e.id ORDER BY i.position LIMIT 1),
       (CASE e.category::text
            WHEN 'supplies' THEN 'home'
            WHEN 'communication' THEN 'electronics'
            WHEN 'travel' THEN 'travel'
            WHEN 'accommodation' THEN 'travel'
            ELSE 'other' END)::request_category,
       e.incurred_on, e.description,
       (CASE e.status::text
            WHEN 'draft' THEN 'draft'
            WHEN 'submitted' THEN 'submitted'
            WHEN 'approved' THEN 'approved'
            ELSE 'closed' END)::request_status,
       e.submitted_at,
       CASE WHEN e.status::text = 'approved' THEN e.decided_at END,
       CASE WHEN e.status::text = 'rejected' THEN e.decided_at END,
       CASE WHEN e.status::text = 'rejected' THEN 'rejected' END,
       e.created_at, e.updated_at
  FROM expenses e
ON CONFLICT (id) DO NOTHING;

INSERT INTO request_reviewers (request_id, user_id, decision, decided_at)
SELECT a.expense_id, a.approver_id,
       (CASE WHEN e.decided_by = a.approver_id AND e.status::text = 'approved' THEN 'approved'
             WHEN e.decided_by = a.approver_id AND e.status::text = 'rejected' THEN 'rejected'
             ELSE 'pending' END)::reviewer_decision,
       CASE WHEN e.decided_by = a.approver_id THEN e.decided_at END
  FROM expense_approvers a JOIN expenses e ON e.id = a.expense_id
ON CONFLICT DO NOTHING;

INSERT INTO attachments (id, request_id, kind, file_name, content_type, byte_size, storage_key, uploaded_by, created_at)
SELECT r.id, r.expense_id, 'evidence', r.file_name, r.content_type, r.byte_size, r.storage_key, e.user_id, r.uploaded_at
  FROM receipts r JOIN expenses e ON e.id = r.expense_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO activities (request_id, user_id, action, created_at)
SELECT id, user_id, 'created', created_at FROM expenses;

INSERT INTO comments (request_id, user_id, body, created_at)
SELECT id, decided_by, decision_note, decided_at FROM expenses
 WHERE decision_note IS NOT NULL AND decided_by IS NOT NULL;

ALTER TABLE receipts          RENAME TO legacy_receipts;
ALTER TABLE expense_items     RENAME TO legacy_expense_items;
ALTER TABLE expense_approvers RENAME TO legacy_expense_approvers;
ALTER TABLE expenses          RENAME TO legacy_expenses;
ALTER TABLE tenants           RENAME TO legacy_tenants;
ALTER TABLE users DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE users DROP COLUMN IF EXISTS role;
"#;

pub async fn run(db: &PgPool) -> anyhow::Result<()> {
    // 引数なしの &str は simple query で送られるので複数文をまとめて実行できる
    db.execute(SCHEMA_SQL).await?;

    let (legacy,): (bool,) = sqlx::query_as("SELECT to_regclass('public.expenses') IS NOT NULL")
        .fetch_one(db)
        .await?;
    if legacy {
        tracing::info!("migrating legacy expense data to purchase requests");
        let mut tx = db.begin().await?;
        (&mut *tx).execute(LEGACY_TENANT_SQL).await?;
        (&mut *tx).execute(LEGACY_CONVERT_SQL).await?;
        tx.commit().await?;
    }

    // 説明欄を追加する前からある家事に、初期セットと同じ名前なら初期の説明を入れる。
    // 一度埋めれば NULL は残らないので、管理者が後で消した説明を埋め直すことはない
    for (name, _, description) in chores::DEFAULT_CHORES {
        sqlx::query("UPDATE chores SET description = $1 WHERE description IS NULL AND name = $2")
            .bind(description)
            .bind(name)
            .execute(db)
            .await?;
    }
    db.execute("UPDATE chores SET description = '' WHERE description IS NULL").await?;

    // アイコン未入力の家事は以前 ✅ にしていたが、「コミット済み」に見えるので名前から選んだ絵文字に置き換える。
    // 列の既定値が ✅ のままの DB でだけ行い、最後に既定値を変えるので一度しか動かない
    // (その後に管理者が自分で ✅ を選んだ家事は変えない)
    let (old_default,): (bool,) = sqlx::query_as(
        "SELECT COALESCE(column_default LIKE '%✅%', FALSE) FROM information_schema.columns
          WHERE table_name = 'chores' AND column_name = 'icon'",
    )
    .fetch_one(db)
    .await?;
    if old_default {
        let rows: Vec<(Uuid, String)> = sqlx::query_as("SELECT id, name FROM chores WHERE icon = '✅'")
            .fetch_all(db)
            .await?;
        for (id, name) in rows {
            sqlx::query("UPDATE chores SET icon = $1 WHERE id = $2")
                .bind(chores::guess_icon(&name))
                .bind(id)
                .execute(db)
                .await?;
        }
        db.execute("ALTER TABLE chores ALTER COLUMN icon SET DEFAULT '🏠'").await?;
    }

    // 家事がまだない家族 (機能追加前からある家族) に初期セットを入れる
    let families: Vec<(Uuid,)> =
        sqlx::query_as("SELECT id FROM families f WHERE NOT EXISTS (SELECT 1 FROM chores c WHERE c.family_id = f.id)")
            .fetch_all(db)
            .await?;
    for (id,) in families {
        let mut conn = db.acquire().await?;
        chores::create_defaults(&mut conn, id).await?;
    }

    // 初期ラベルをまだ入れていない家族に入れ、カテゴリをラベルに移す
    let families: Vec<(Uuid,)> =
        sqlx::query_as("SELECT id FROM families WHERE NOT labels_seeded OR NOT category_labels_migrated")
        .fetch_all(db)
        .await?;
    for (id,) in families {
        let mut conn = db.acquire().await?;
        labels::create_defaults(&mut conn, id).await?;
    }
    Ok(())
}
