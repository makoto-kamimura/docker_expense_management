use serde_json::json;
use uuid::Uuid;

use crate::{
    auth::hash_password,
    handlers::{chores, family::generate_invite_code, labels},
    state::AppState,
};

struct Seed<'a> {
    email: &'a str,
    name: &'a str,
    can_request: bool,
    can_review: bool,
    is_admin: bool,
}

/// デモ用の家族・メンバー・サンプル申請を投入する (すでにあれば何もしない)
/// 以前の英語版シードで投入されたデモデータを日本語に置き換える。
/// デモアカウントの行を、英語の初期値と完全一致する場合だけ更新するので、
/// 利用者が作成・編集したデータには影響せず、何度流しても同じ結果になる。
const LOCALIZE_DEMO_SQL: &str = r#"
UPDATE families SET name = 'デモ家族'
 WHERE name = 'Demo Family'
   AND id IN (SELECT m.family_id FROM family_members m JOIN users u ON u.id = m.user_id WHERE u.email = 'dad@example.com');
UPDATE families SET name = '別の家族'
 WHERE name = 'Other Family'
   AND id IN (SELECT m.family_id FROM family_members m JOIN users u ON u.id = m.user_id WHERE u.email = 'other@example.com');

UPDATE users SET name = v.ja FROM (VALUES
    ('dad@example.com', 'Dad', 'パパ'),
    ('mom@example.com', 'Mom', 'ママ'),
    ('child@example.com', 'Child', '子ども'),
    ('other@example.com', 'Neighbor', 'おとなりさん')
) AS v(email, en, ja)
 WHERE users.email = v.email AND users.name = v.en;

UPDATE purchase_requests r SET
    title        = v.title,
    reason       = CASE WHEN r.reason = v.reason_en THEN v.reason ELSE r.reason END,
    seller       = CASE WHEN r.seller = v.seller_en THEN v.seller ELSE r.seller END,
    product_name = CASE WHEN r.product_name = v.product_en THEN v.product ELSE r.product_name END
FROM (VALUES
    ('New Camera for Family Trips', '家族旅行用の新しいカメラ',
     E'I want to use this camera for family trips and outdoor activities.\nThe current camera is over 8 years old and the battery no longer holds a charge.',
     E'家族旅行やアウトドアで使うカメラが欲しいです。\n今のカメラは8年以上前のもので、バッテリーがすぐ切れてしまいます。',
     'Amazon', 'Amazon', 'Sony α6400 Kit', 'ソニー α6400 レンズキット'),
    ('Coffee Machine', 'コーヒーマシン',
     'We buy coffee outside almost every day. A machine at home would pay for itself in about a year.',
     'ほぼ毎日外でコーヒーを買っています。家にマシンがあれば1年ほどで元が取れます。',
     'Yodobashi', 'ヨドバシカメラ', 'De''Longhi Magnifica S', 'デロンギ マグニフィカS'),
    ('Gaming PC', 'ゲーミングPC',
     'For games and video editing.', 'ゲームと動画編集に使いたいです。',
     'Dospara', 'ドスパラ', 'Custom build', 'BTO カスタムモデル')
) AS v(title_en, title, reason_en, reason, seller_en, seller, product_en, product)
 WHERE r.title = v.title_en
   AND r.requester_id = (SELECT id FROM users WHERE email = 'dad@example.com');

UPDATE comments c SET body = v.ja FROM (VALUES
    ('Why do you need this instead of your current camera?', '今のカメラではなく、新しいカメラが必要な理由は？'),
    ('The current camera is over 8 years old and the battery is broken. It also can''t shoot 4K video.',
     '今のカメラは8年以上使っていてバッテリーが壊れています。4K動画も撮れません。'),
    ('Sounds good. Let''s get it before the holidays.', 'いいね。連休前に買おう。'),
    ('Can you add a cheaper option to compare? ¥250,000 is a lot.', 'もう少し安い候補も比較してほしいです。25万円は大きいので。')
) AS v(en, ja)
 WHERE c.body = v.en
   AND c.user_id IN (SELECT id FROM users WHERE email IN ('dad@example.com', 'mom@example.com'));

UPDATE alternative_products a SET name = v.ja FROM (VALUES
    ('Canon EOS R50', 'キヤノン EOS R50'),
    ('Sony α7C II', 'ソニー α7C II')
) AS v(en, ja)
 WHERE a.name = v.en
   AND a.request_id IN (SELECT r.id FROM purchase_requests r JOIN users u ON u.id = r.requester_id WHERE u.email = 'dad@example.com');
"#;

pub async fn seed(state: &AppState) -> anyhow::Result<()> {
    // 旧 DB から移行した場合は、旧 admin@example.com の家族をデモ家族として使う
    let demo = match family_of(state, "dad@example.com").await? {
        Some(id) => id,
        None => match family_of(state, "admin@example.com").await? {
            Some(id) => id,
            None => get_or_create_family(state, "デモ家族").await?,
        },
    };
    seed_members(
        state,
        demo,
        &[
            Seed { email: "dad@example.com", name: "パパ", can_request: true, can_review: true, is_admin: true },
            Seed { email: "mom@example.com", name: "ママ", can_request: true, can_review: true, is_admin: false },
            Seed { email: "child@example.com", name: "子ども", can_request: true, can_review: false, is_admin: false },
        ],
    )
    .await?;
    seed_requests(state, demo).await?;
    seed_outings(state, demo).await?;
    seed_activities(state, demo).await?;
    seed_chore_commits(state, demo).await?;
    sqlx::Executor::execute(&state.db, LOCALIZE_DEMO_SQL).await?;

    // 家族ごとの分離を確認するための別の家族
    // 既存環境では other@example.com の家族 (旧名 "Other Family") をそのまま使う
    let other = match family_of(state, "other@example.com").await? {
        Some(id) => id,
        None => get_or_create_family(state, "別の家族").await?,
    };
    seed_members(
        state,
        other,
        &[Seed { email: "other@example.com", name: "おとなりさん", can_request: true, can_review: true, is_admin: true }],
    )
    .await?;
    let mut conn = state.db.acquire().await?;
    chores::create_defaults(&mut conn, other).await?;
    labels::create_defaults(&mut conn, other).await?;
    Ok(())
}

/// デモ家族の家事コミット (直近 6 週間ぶん)。家族にコミットが 1 件もないときだけ入れる。
/// 子どもは毎日続けていて連続記録あり、ママはほぼ毎日、パパはときどき。
/// レビュー画面で申請者ごとの差が見えるようにしている。
async fn seed_chore_commits(state: &AppState, family_id: Uuid) -> anyhow::Result<()> {
    let mut conn = state.db.acquire().await?;
    chores::create_defaults(&mut conn, family_id).await?;
    labels::create_defaults(&mut conn, family_id).await?;
    let (exists,): (bool,) = sqlx::query_as(
        "SELECT EXISTS (SELECT 1 FROM chore_commits cc JOIN chores c ON c.id = cc.chore_id WHERE c.family_id = $1)",
    )
    .bind(family_id)
    .fetch_one(&state.db)
    .await?;
    if exists {
        return Ok(());
    }
    // (メール, 家事の名前, 何日前から, 何日おき) … 0 日前 (今日) は含めず、画面でコミットを試せるようにする
    let plan: &[(&str, &str, i32, i32)] = &[
        ("child@example.com", "食器洗い", 20, 1),
        ("child@example.com", "ゴミ出し", 20, 2),
        ("child@example.com", "掃除", 40, 3),
        ("mom@example.com", "料理", 40, 1),
        ("mom@example.com", "洗濯", 40, 2),
        ("mom@example.com", "買い出し", 40, 4),
        ("dad@example.com", "掃除", 40, 7),
        ("dad@example.com", "洗濯", 30, 9),
    ];
    for &(email, chore, from, step) in plan {
        sqlx::query(
            "INSERT INTO chore_commits (chore_id, user_id, committed_on, created_at)
             SELECT c.id, u.id, d.day, d.day + time '20:00'
               FROM chores c, users u,
                    LATERAL (SELECT (now() AT TIME ZONE 'Asia/Tokyo')::date - n AS day
                               FROM generate_series(1, $3, $4) AS n) d
              WHERE c.family_id = $1 AND c.name = $2 AND u.email = $5
             ON CONFLICT DO NOTHING",
        )
        .bind(family_id)
        .bind(chore)
        .bind(from)
        .bind(step)
        .bind(email)
        .execute(&state.db)
        .await?;
    }
    Ok(())
}

async fn family_of(state: &AppState, email: &str) -> anyhow::Result<Option<Uuid>> {
    let row: Option<(Uuid,)> = sqlx::query_as(
        "SELECT m.family_id FROM family_members m JOIN users u ON u.id = m.user_id WHERE u.email = $1",
    )
    .bind(email)
    .fetch_optional(&state.db)
    .await?;
    Ok(row.map(|r| r.0))
}

async fn get_or_create_family(state: &AppState, name: &str) -> anyhow::Result<Uuid> {
    let row: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM families WHERE name = $1 ORDER BY created_at LIMIT 1")
            .bind(name)
            .fetch_optional(&state.db)
            .await?;
    if let Some((id,)) = row {
        return Ok(id);
    }
    let (id,): (Uuid,) =
        sqlx::query_as("INSERT INTO families (name, invite_code) VALUES ($1, $2) RETURNING id")
            .bind(name)
            .bind(generate_invite_code())
            .fetch_one(&state.db)
            .await?;
    tracing::info!("seeded family {name}");
    Ok(id)
}

async fn seed_members(state: &AppState, family_id: Uuid, seeds: &[Seed<'_>]) -> anyhow::Result<()> {
    for s in seeds {
        let exists: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM users WHERE email = $1")
            .bind(s.email)
            .fetch_optional(&state.db)
            .await?;
        if exists.is_some() {
            continue;
        }
        let hash = hash_password("password123").map_err(|_| anyhow::anyhow!("hash failed"))?;
        let mut tx = state.db.begin().await?;
        // デモではオンボーディング済みにしておき、すぐ一覧を見られるようにする
        let (uid,): (Uuid,) = sqlx::query_as(
            "INSERT INTO users (email, password_hash, name, onboarded_at) VALUES ($1, $2, $3, now()) RETURNING id",
        )
        .bind(s.email)
        .bind(&hash)
        .bind(s.name)
        .fetch_one(&mut *tx)
        .await?;
        sqlx::query(
            "INSERT INTO family_members (family_id, user_id, can_request, can_review, is_admin)
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(family_id)
        .bind(uid)
        .bind(s.can_request)
        .bind(s.can_review)
        .bind(s.is_admin)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        tracing::info!("seeded user {}", s.email);
    }
    Ok(())
}

async fn user_id(state: &AppState, email: &str) -> anyhow::Result<Uuid> {
    let (id,): (Uuid,) = sqlx::query_as("SELECT id FROM users WHERE email = $1")
        .bind(email)
        .fetch_one(&state.db)
        .await?;
    Ok(id)
}

/// 画面の流れが一目でわかるよう、状態の違うサンプル申請を入れる (Dad の申請が 1 件もないときだけ)
async fn seed_requests(state: &AppState, family_id: Uuid) -> anyhow::Result<()> {
    let dad = user_id(state, "dad@example.com").await?;
    let mom = user_id(state, "mom@example.com").await?;
    let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM purchase_requests WHERE requester_id = $1")
        .bind(dad)
        .fetch_one(&state.db)
        .await?;
    if count > 0 {
        return Ok(());
    }

    let mut tx = state.db.begin().await?;
    let insert = |title: &'static str, reason: &'static str, price: i64, seller: &'static str,
                  product: &'static str, url: &'static str, category: &'static str, status: &'static str| {
        sqlx::query_as::<_, (Uuid,)>(
            "INSERT INTO purchase_requests
                (family_id, requester_id, title, reason, price, seller, product_name, product_url, category,
                 status, submitted_at, approved_at, merged_at, merged_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::request_category, $10::request_status,
                     now() - interval '3 days',
                     CASE WHEN $10 IN ('approved', 'merged') THEN now() - interval '1 day' END,
                     CASE WHEN $10 = 'merged' THEN now() - interval '12 hours' END,
                     CASE WHEN $10 = 'merged' THEN $11::uuid END)
             RETURNING id",
        )
        .bind(family_id)
        .bind(dad)
        .bind(title)
        .bind(reason)
        .bind(price)
        .bind(seller)
        .bind(product)
        .bind(url)
        .bind(category)
        .bind(status)
        .bind(mom)
    };

    let (camera,) = insert(
        "家族旅行用の新しいカメラ",
        "家族旅行やアウトドアで使うカメラが欲しいです。\n今のカメラは8年以上前のもので、バッテリーがすぐ切れてしまいます。",
        128_000, "Amazon", "ソニー α6400 レンズキット", "https://www.amazon.co.jp/", "electronics", "under_review",
    )
    .fetch_one(&mut *tx)
    .await?;
    let (coffee,) = insert(
        "コーヒーマシン",
        "ほぼ毎日外でコーヒーを買っています。家にマシンがあれば1年ほどで元が取れます。",
        85_000, "ヨドバシカメラ", "デロンギ マグニフィカS", "https://www.yodobashi.com/", "home", "merged",
    )
    .fetch_one(&mut *tx)
    .await?;
    let (pc,) = insert(
        "ゲーミングPC",
        "ゲームと動画編集に使いたいです。",
        250_000, "ドスパラ", "BTO カスタムモデル", "https://www.dospara.co.jp/", "hobby", "changes_needed",
    )
    .fetch_one(&mut *tx)
    .await?;

    for id in [camera, coffee, pc] {
        sqlx::query("INSERT INTO request_reviewers (request_id, user_id, decision) VALUES ($1, $2, 'pending')")
            .bind(id)
            .bind(mom)
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query("UPDATE request_reviewers SET decision = 'approved', decided_at = now() - interval '1 day' WHERE request_id = $1")
        .bind(coffee)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE request_reviewers SET decision = 'changes_requested', decided_at = now() - interval '1 day' WHERE request_id = $1")
        .bind(pc)
        .execute(&mut *tx)
        .await?;
    for (id, name, price, url) in [
        (camera, "キヤノン EOS R50", 98_000_i64, "https://canon.jp/"),
        (camera, "ソニー α7C II", 258_000, "https://www.sony.jp/"),
    ] {
        sqlx::query(
            "INSERT INTO alternative_products (request_id, position, name, price, url)
             VALUES ($1, (SELECT COUNT(*) FROM alternative_products WHERE request_id = $1), $2, $3, $4)",
        )
        .bind(id)
        .bind(name)
        .bind(price)
        .bind(url)
        .execute(&mut *tx)
        .await?;
    }

    // Activity (時刻をずらして流れを再現する)
    let events: [(Uuid, Uuid, &str, &str); 9] = [
        (camera, dad, "created", "4 days"),
        (camera, dad, "submitted", "3 days"),
        (camera, mom, "started_review", "2 days"),
        (coffee, dad, "created", "4 days"),
        (coffee, dad, "submitted", "3 days"),
        (coffee, mom, "approved", "1 day"),
        (coffee, mom, "merged", "12 hours"),
        (pc, dad, "submitted", "3 days"),
        (pc, mom, "changes_requested", "1 day"),
    ];
    for (id, uid, action, ago) in events {
        sqlx::query(
            "INSERT INTO activities (request_id, user_id, action, metadata, created_at)
             VALUES ($1, $2, $3, $4, now() - $5::interval)",
        )
        .bind(id)
        .bind(uid)
        .bind(action)
        .bind(json!({}))
        .bind(ago)
        .execute(&mut *tx)
        .await?;
    }
    let comments: [(Uuid, Uuid, &str, &str); 4] = [
        (camera, mom, "今のカメラではなく、新しいカメラが必要な理由は？", "2 days"),
        (camera, dad, "今のカメラは8年以上使っていてバッテリーが壊れています。4K動画も撮れません。", "1 day"),
        (coffee, mom, "いいね。連休前に買おう。", "1 day"),
        (pc, mom, "もう少し安い候補も比較してほしいです。25万円は大きいので。", "1 day"),
    ];
    for (id, uid, body, ago) in comments {
        sqlx::query("INSERT INTO comments (request_id, user_id, body, created_at) VALUES ($1, $2, $3, now() - $4::interval)")
            .bind(id)
            .bind(uid)
            .bind(body)
            .bind(ago)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    tracing::info!("seeded sample requests");
    Ok(())
}

/// 「行きたいところ」のサンプル稟議 (デモ家族にお出かけの稟議が 1 件もないときだけ)
async fn seed_outings(state: &AppState, family_id: Uuid) -> anyhow::Result<()> {
    let (count,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM purchase_requests WHERE family_id = $1 AND kind = 'outing'")
            .bind(family_id)
            .fetch_one(&state.db)
            .await?;
    if count > 0 {
        return Ok(());
    }
    let dad = user_id(state, "dad@example.com").await?;
    let mom = user_id(state, "mom@example.com").await?;
    let child = user_id(state, "child@example.com").await?;

    let mut tx = state.db.begin().await?;
    // 子どもからの「行きたい」: パパとママにレビュー依頼中
    let (aquarium,): (Uuid,) = sqlx::query_as(
        "INSERT INTO purchase_requests
            (family_id, requester_id, kind, title, reason, price, seller, product_name, product_url,
             category, planned_date, status, submitted_at, created_at)
         VALUES ($1, $2, 'outing', '週末に水族館へ行きたい',
                 '学校で海の生き物を調べていて、本物のジンベエザメを見てみたいです。\n夏休みの自由研究にもしたいです。',
                 12000, '公式サイトで前売り券', '海遊館', 'https://www.kaiyukan.com/',
                 'leisure', CURRENT_DATE + 10, 'submitted', now() - interval '1 day', now() - interval '1 day')
         RETURNING id",
    )
    .bind(family_id)
    .bind(child)
    .fetch_one(&mut *tx)
    .await?;
    // パパの日帰り旅行: 行ってきた (完了)
    let (nikko,): (Uuid,) = sqlx::query_as(
        "INSERT INTO purchase_requests
            (family_id, requester_id, kind, title, reason, price, seller, product_name, product_url,
             category, planned_date, status, submitted_at, approved_at, merged_at, merged_by,
             purchased_at, purchase_date, actual_price, created_at)
         VALUES ($1, $2, 'outing', '紅葉を見に日光へ日帰り旅行',
                 '家族でゆっくり出かける機会が最近なかったので、紅葉の時期に日光へ行きたいです。',
                 30000, '東武鉄道 (特急券)', '日光 (いろは坂・華厳の滝)', 'https://www.nikko-kankou.org/',
                 'travel', CURRENT_DATE - 14, 'purchased', now() - interval '30 days', now() - interval '28 days',
                 now() - interval '28 days', $3, now() - interval '14 days', CURRENT_DATE - 14, 27600,
                 now() - interval '31 days')
         RETURNING id",
    )
    .bind(family_id)
    .bind(dad)
    .bind(mom)
    .fetch_one(&mut *tx)
    .await?;

    for (id, uid, decision) in [(aquarium, mom, "pending"), (aquarium, dad, "pending"), (nikko, mom, "approved")] {
        sqlx::query("INSERT INTO request_reviewers (request_id, user_id, decision) VALUES ($1, $2, $3::reviewer_decision)")
            .bind(id)
            .bind(uid)
            .bind(decision)
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query(
        "INSERT INTO alternative_products (request_id, position, name, price, url, notes)
         VALUES ($1, 0, '天王寺動物園', 2000, 'https://www.tennojizoo.jp/', '近くて安いけど、海の生き物は少ない')",
    )
    .bind(aquarium)
    .execute(&mut *tx)
    .await?;
    let events: [(Uuid, Uuid, &str, &str); 7] = [
        (aquarium, child, "created", "1 day"),
        (aquarium, child, "submitted", "1 day"),
        (nikko, dad, "created", "31 days"),
        (nikko, dad, "submitted", "30 days"),
        (nikko, mom, "approved", "28 days"),
        (nikko, mom, "merged", "28 days"),
        (nikko, dad, "purchased", "14 days"),
    ];
    for (id, uid, action, ago) in events {
        sqlx::query(
            "INSERT INTO activities (request_id, user_id, action, metadata, created_at)
             VALUES ($1, $2, $3, '{}'::jsonb, now() - $4::interval)",
        )
        .bind(id)
        .bind(uid)
        .bind(action)
        .bind(ago)
        .execute(&mut *tx)
        .await?;
    }
    sqlx::query("INSERT INTO comments (request_id, user_id, body, created_at) VALUES ($1, $2, $3, now() - interval '28 days')")
        .bind(nikko)
        .bind(mom)
        .bind("いいね！お弁当を持っていこう。")
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    tracing::info!("seeded sample outings");
    Ok(())
}

/// 「やりたいこと」のサンプル。日光旅行の稟議から分岐した「その後でやりたいこと」として入れる
/// (デモ家族にやりたいことの稟議が 1 件もないときだけ)
async fn seed_activities(state: &AppState, family_id: Uuid) -> anyhow::Result<()> {
    let (count,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM purchase_requests WHERE family_id = $1 AND kind = 'activity'")
            .bind(family_id)
            .fetch_one(&state.db)
            .await?;
    if count > 0 {
        return Ok(());
    }
    let dad = user_id(state, "dad@example.com").await?;
    let mom = user_id(state, "mom@example.com").await?;
    let child = user_id(state, "child@example.com").await?;
    let parent: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM purchase_requests WHERE family_id = $1 AND title = '紅葉を見に日光へ日帰り旅行' LIMIT 1",
    )
    .bind(family_id)
    .fetch_optional(&state.db)
    .await?;
    let parent_id = parent.map(|p| p.0);

    let mut tx = state.db.begin().await?;
    let (camp,): (Uuid,) = sqlx::query_as(
        "INSERT INTO purchase_requests
            (family_id, requester_id, kind, parent_id, title, reason, price, seller, product_name,
             category, planned_date, status, submitted_at, created_at)
         VALUES ($1, $2, 'activity', $3, '今度は日光でキャンプをしてみたい',
                 '日光旅行がとても楽しかったので、次は自然の中でキャンプをしてみたいです。\nテント泊が不安なら、まずはグランピングでも。',
                 40000, 'キャンプ場のサイト予約', 'ファミリーキャンプ (1泊)',
                 'leisure', CURRENT_DATE + 30, 'submitted', now() - interval '2 hours', now() - interval '3 hours')
         RETURNING id",
    )
    .bind(family_id)
    .bind(child)
    .bind(parent_id)
    .fetch_one(&mut *tx)
    .await?;
    let (piano,): (Uuid,) = sqlx::query_as(
        "INSERT INTO purchase_requests
            (family_id, requester_id, kind, title, reason, price, seller, product_name,
             category, planned_date, status, created_at)
         VALUES ($1, $2, 'activity', 'ピアノを習いたい',
                 '友だちが弾いているのを見て、自分も弾けるようになりたいです。まずは体験レッスンに行きたい。',
                 8000, '駅前の音楽教室', '月4回のレッスン (体験から)',
                 'education', CURRENT_DATE + 7, 'draft', now() - interval '1 hour')
         RETURNING id",
    )
    .bind(family_id)
    .bind(child)
    .fetch_one(&mut *tx)
    .await?;
    for uid in [dad, mom] {
        sqlx::query("INSERT INTO request_reviewers (request_id, user_id) VALUES ($1, $2)")
            .bind(camp)
            .bind(uid)
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query("INSERT INTO request_reviewers (request_id, user_id) VALUES ($1, $2)")
        .bind(piano)
        .bind(mom)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "INSERT INTO alternative_products (request_id, position, name, price, notes)
         VALUES ($1, 0, 'グランピング (1泊)', 60000, '道具いらずで手軽。そのぶん少し高い')",
    )
    .bind(camp)
    .execute(&mut *tx)
    .await?;
    let created_meta = match parent_id {
        Some(pid) => serde_json::json!({ "parent_id": pid, "parent_title": "紅葉を見に日光へ日帰り旅行" }),
        None => serde_json::json!({}),
    };
    for (id, action, meta, ago) in [
        (camp, "created", created_meta, "3 hours"),
        (camp, "submitted", serde_json::json!({}), "2 hours"),
        (piano, "created", serde_json::json!({}), "1 hour"),
    ] {
        sqlx::query(
            "INSERT INTO activities (request_id, user_id, action, metadata, created_at)
             VALUES ($1, $2, $3, $4, now() - $5::interval)",
        )
        .bind(id)
        .bind(child)
        .bind(action)
        .bind(meta)
        .bind(ago)
        .execute(&mut *tx)
        .await?;
    }
    if let Some(pid) = parent_id {
        sqlx::query(
            "INSERT INTO activities (request_id, user_id, action, metadata, created_at)
             VALUES ($1, $2, 'branched', $3, now() - interval '2 hours')",
        )
        .bind(pid)
        .bind(child)
        .bind(serde_json::json!({ "child_id": camp, "child_title": "今度は日光でキャンプをしてみたい", "child_kind": "activity" }))
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    tracing::info!("seeded sample activities");
    Ok(())
}
