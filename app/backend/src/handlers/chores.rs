use std::collections::{BTreeSet, HashMap};

use axum::{
    extract::{Multipart, Path, State},
    response::Response,
    Json,
};
use chrono::{Datelike, Duration, NaiveDate};
use sqlx::{PgConnection, PgPool};
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiError, ApiResult},
    handlers::attachments::{resolve_content_type, serve_file, MAX_BYTES},
    models::{
        Badge, Chore, ChoreImage, ChoreImageUpdate, ChoreInput, ChoreOrder, ChoreStat, ChoreStatus, ChoresResp,
        ContributionDay, ContributionSummary, MemberContribution, PushInput, PushStatus, TrophyCount, UserRef,
    },
    state::AppState,
};

/// 「今日」は日本時間で数える
const TODAY_SQL: &str = "(now() AT TIME ZONE 'Asia/Tokyo')::date";
/// 草グラフに出す週数
const CALENDAR_WEEKS: i64 = 12;
const MAX_CHORES: i64 = 30;

/// 1 つの家事の説明・見本画像の説明の最大文字数
const MAX_DESCRIPTION: usize = 200;
/// 1 つの家事に付けられる見本画像の数
const MAX_IMAGES: i64 = 10;

/// 家族を作ったときに用意する家事 (名前, アイコン, 説明)
pub const DEFAULT_CHORES: &[(&str, &str, &str)] = &[
    ("掃除", "🧹", "部屋・トイレ・お風呂など、どこか1か所でも掃除したら"),
    ("洗濯", "👕", "洗濯機を回す・干す・たたむのどれかをしたら"),
    ("料理", "🍳", "家族のごはんを1食でも作ったら"),
    ("食器洗い", "🍽️", "食後の食器を洗って片付けたら"),
    ("ゴミ出し", "🗑️", "ゴミをまとめて集積所に出したら"),
    ("買い出し", "🛒", "食材や日用品の買い物に行ったら"),
];

/// アイコンが未入力のときに、家事の名前から選ぶ絵文字 (キーワード, 絵文字)。上から順に最初に一致したもの。
/// 「お風呂掃除」は 🛁 にしたいので、場所・対象を表す語を「掃除」などの動作より先に並べる。
const ICON_KEYWORDS: &[(&[&str], &str)] = &[
    (&["風呂", "浴室", "バス"], "🛁"),
    (&["トイレ"], "🚽"),
    (&["洗面"], "🪥"),
    (&["散歩", "ペット", "犬", "猫", "餌", "エサ"], "🐾"),
    (&["布団", "ベッド", "シーツ"], "🛏️"),
    (&["窓"], "🪟"),
    (&["植物", "水やり", "花", "庭"], "🪴"),
    (&["アイロン"], "👔"),
    (&["洗濯"], "👕"),
    (&["食器", "皿", "食洗"], "🍽️"),
    (&["料理", "ごはん", "ご飯", "弁当", "キッチン", "台所"], "🍳"),
    (&["ゴミ", "ごみ"], "🗑️"),
    (&["買い"], "🛒"),
    (&["片付", "片づけ", "整理", "整頓"], "📦"),
    (&["掃除", "拭", "モップ"], "🧹"),
];
/// どのキーワードにも当てはまらないときのアイコン
const FALLBACK_ICON: &str = "🏠";

/// 家事の名前から合いそうなアイコンを選ぶ
pub fn guess_icon(name: &str) -> &'static str {
    ICON_KEYWORDS
        .iter()
        .find(|(words, _)| words.iter().any(|w| name.contains(w)))
        .map_or(FALLBACK_ICON, |(_, icon)| icon)
}

/// 家事が 1 件もない家族に初期セットを入れる (何度呼んでも同じ結果)
pub async fn create_defaults(conn: &mut PgConnection, family_id: Uuid) -> ApiResult<()> {
    let names: Vec<&str> = DEFAULT_CHORES.iter().map(|c| c.0).collect();
    let icons: Vec<&str> = DEFAULT_CHORES.iter().map(|c| c.1).collect();
    let descriptions: Vec<&str> = DEFAULT_CHORES.iter().map(|c| c.2).collect();
    sqlx::query(
        "INSERT INTO chores (family_id, name, icon, description, position)
         SELECT $1, d.name, d.icon, d.description, d.ord - 1
           FROM UNNEST($2::text[], $3::text[], $4::text[]) WITH ORDINALITY AS d(name, icon, description, ord)
          WHERE NOT EXISTS (SELECT 1 FROM chores WHERE family_id = $1)",
    )
    .bind(family_id)
    .bind(&names)
    .bind(&icons)
    .bind(&descriptions)
    .execute(conn)
    .await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// 集計 (DB に依存しない純粋関数)
// ---------------------------------------------------------------------------

/// (今日まで続いている連続日数, 最長の連続日数)。
/// 今日まだコミットしていなくても、昨日まで続いていれば途切れていない扱いにする。
fn streaks(days: &BTreeSet<NaiveDate>, today: NaiveDate) -> (i64, i64) {
    let mut longest = 0;
    let mut run = 0;
    let mut prev: Option<NaiveDate> = None;
    for &d in days.iter().filter(|&&d| d <= today) {
        run = if prev.is_some_and(|p| d - p == Duration::days(1)) { run + 1 } else { 1 };
        longest = longest.max(run);
        prev = Some(d);
    }
    let current = match prev {
        Some(last) if today - last <= Duration::days(1) => run,
        _ => 0,
    };
    (current, longest)
}

/// 連続記録と累計日数で付くマーク。一度取ったら消えないよう、連続は最長で判定する。
fn badges(total_days: i64, longest: i64) -> Vec<Badge> {
    const STREAK: &[(i64, &str, &str, &str)] = &[
        (3, "streak_3", "🔥", "3日連続"),
        (7, "streak_7", "⭐", "7日連続"),
        (30, "streak_30", "💎", "30日連続"),
    ];
    const TOTAL: &[(i64, &str, &str, &str)] = &[
        (10, "total_10", "🧹", "累計10日"),
        (50, "total_50", "🏅", "累計50日"),
        (100, "total_100", "👑", "累計100日"),
    ];
    let mut out = Vec::new();
    if total_days > 0 {
        out.push(Badge { key: "first", icon: "🌱", label: "はじめてのコミット" });
    }
    out.extend(
        STREAK
            .iter()
            .filter(|b| longest >= b.0)
            .map(|b| Badge { key: b.1, icon: b.2, label: b.3 }),
    );
    out.extend(
        TOTAL
            .iter()
            .filter(|b| total_days >= b.0)
            .map(|b| Badge { key: b.1, icon: b.2, label: b.3 }),
    );
    out
}

// ---------------------------------------------------------------------------
// プッシュの種類 (すべて / 毎日 / 週 / 月)
// ---------------------------------------------------------------------------

/// プッシュの種類。all は今日すべての家事、それ以外は推奨頻度の期間が同じ家事が対象
pub struct PushScope {
    pub key: &'static str,
    /// タブの名前
    pub label: &'static str,
    /// 対象の期間
    pub period: &'static str,
    pub trophy_icon: &'static str,
    pub trophy_label: &'static str,
    /// プッシュできないときの案内
    pub hint: &'static str,
}

pub const PUSH_SCOPES: &[PushScope] = &[
    PushScope { key: "all", label: "すべて", period: "今日", trophy_icon: "🏆", trophy_label: "すべてクリア", hint: "今日の家事をすべてコミットするとプッシュできます" },
    PushScope { key: "day", label: "毎日", period: "今日", trophy_icon: "🥉", trophy_label: "毎日クリア", hint: "毎日の家事を今日すべてコミットするとプッシュできます" },
    PushScope { key: "week", label: "週", period: "今週", trophy_icon: "🥈", trophy_label: "週クリア", hint: "週の家事を今週それぞれの回数ぶんコミットするとプッシュできます" },
    PushScope { key: "month", label: "月", period: "今月", trophy_icon: "🥇", trophy_label: "月クリア", hint: "月の家事を今月それぞれの回数ぶんコミットするとプッシュできます" },
];

fn push_scope(key: &str) -> Option<&'static PushScope> {
    PUSH_SCOPES.iter().find(|s| s.key == key)
}

/// 期間の初日 (週は草グラフと同じ日曜始まり)
pub fn period_start(scope: &str, today: NaiveDate) -> NaiveDate {
    match scope {
        "week" => today - Duration::days(today.weekday().num_days_from_sunday() as i64),
        "month" => today.with_day(1).unwrap_or(today),
        _ => today,
    }
}

/// 1 日 1 回しかコミットできないので、期間の日数を超える回数はその日数に抑える
fn target_cap(scope: &str, today: NaiveDate) -> i64 {
    match scope {
        "week" => 7,
        "month" => {
            let first = period_start("month", today);
            let next = first.checked_add_months(chrono::Months::new(1)).unwrap_or(first);
            (next - first).num_days()
        }
        _ => 1,
    }
}

/// その種類のプッシュの対象か (非表示の家事は呼び出し側で除く)
fn in_scope(chore: &Chore, scope: &str) -> bool {
    scope == "all" || chore.frequency_period.as_deref() == Some(scope)
}

/// 家事 1 つの (今の期間にコミットした日数, クリアに必要な日数)
fn progress(chore: &Chore, scope: &str, commits: &[(Uuid, NaiveDate)], today: NaiveDate) -> (i64, i64) {
    let start = period_start(scope, today);
    let done = commits.iter().filter(|c| c.0 == chore.id && c.1 >= start && c.1 <= today).count() as i64;
    let target = (chore.frequency_times.unwrap_or(1) as i64).clamp(1, target_cap(scope, today));
    (done, target)
}

/// プッシュの記録 1 件
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct PushRow {
    pub user_id: Uuid,
    pub scope: String,
    pub pushed_on: NaiveDate,
    pub period_start: NaiveDate,
}

fn has_pushed(pushes: &[PushRow], scope: &str, today: NaiveDate) -> bool {
    let start = period_start(scope, today);
    pushes.iter().any(|p| p.scope == scope && p.period_start == start)
}

/// ログインユーザーの種類ごとのプッシュの状況。chores は非表示を除いたもの
fn push_statuses(chores: &[&Chore], commits: &[(Uuid, NaiveDate)], pushes: &[PushRow], today: NaiveDate) -> Vec<PushStatus> {
    PUSH_SCOPES
        .iter()
        .map(|s| {
            let targets: Vec<&&Chore> = chores.iter().filter(|c| in_scope(c, s.key)).collect();
            let done = targets
                .iter()
                .filter(|c| {
                    let (done, target) = progress(c, s.key, commits, today);
                    done >= target
                })
                .count() as i64;
            let total = targets.len() as i64;
            let pushed = has_pushed(pushes, s.key, today);
            PushStatus {
                scope: s.key,
                label: s.label,
                period: s.period,
                period_start: period_start(s.key, today),
                trophy_icon: s.trophy_icon,
                trophy_label: s.trophy_label,
                total,
                done,
                can_push: total > 0 && done == total && !pushed,
                pushed,
            }
        })
        .collect()
}

/// 1 人分のコミット (家事 ID, 日付) とプッシュを集計する。chores は by_chore の名前を引くのに使う。
pub fn summarize(
    user_id: Uuid,
    commits: &[(Uuid, NaiveDate)],
    pushes: &[PushRow],
    chores: &[Chore],
    today: NaiveDate,
) -> ContributionSummary {
    let pushes: Vec<&PushRow> = pushes.iter().filter(|p| p.pushed_on <= today).collect();
    let pushed: BTreeSet<NaiveDate> = pushes.iter().map(|p| p.pushed_on).collect();
    let trophy_counts = PUSH_SCOPES
        .iter()
        .map(|s| TrophyCount {
            scope: s.key,
            icon: s.trophy_icon,
            label: s.trophy_label,
            count: pushes.iter().filter(|p| p.scope == s.key).count() as i64,
        })
        .collect();
    let commits: Vec<(Uuid, NaiveDate)> = commits.iter().copied().filter(|c| c.1 <= today).collect();
    let mut per_day: HashMap<NaiveDate, i64> = HashMap::new();
    let mut per_chore: HashMap<Uuid, BTreeSet<NaiveDate>> = HashMap::new();
    for &(chore, day) in &commits {
        *per_day.entry(day).or_default() += 1;
        per_chore.entry(chore).or_default().insert(day);
    }
    let days: BTreeSet<NaiveDate> = per_day.keys().copied().collect();
    let (current_streak, longest_streak) = streaks(&days, today);
    let total_days = days.len() as i64;
    let last_30_days = days.iter().filter(|&&d| today - d < Duration::days(30)).count() as i64;

    // GitHub と同じく日曜始まりの週で CALENDAR_WEEKS 列ぶん並べる (最後の列は今日まで)
    let start = today
        - Duration::days(7 * (CALENDAR_WEEKS - 1))
        - Duration::days(today.weekday().num_days_from_sunday() as i64);
    let calendar = start
        .iter_days()
        .take_while(|d| *d <= today)
        .map(|date| ContributionDay {
            date,
            count: per_day.get(&date).copied().unwrap_or(0),
            pushed: pushed.contains(&date),
        })
        .collect();

    let by_chore = chores
        .iter()
        .filter_map(|c| {
            let set = per_chore.get(&c.id)?;
            Some(ChoreStat {
                chore_id: c.id,
                name: c.name.clone(),
                icon: c.icon.clone(),
                days: set.len() as i64,
                current_streak: streaks(set, today).0,
            })
        })
        .collect();

    ContributionSummary {
        user_id,
        today,
        total_days,
        total_commits: commits.len() as i64,
        last_30_days,
        current_streak,
        longest_streak,
        committed_today: days.contains(&today),
        trophies: pushes.len() as i64,
        trophy_counts,
        pushed_today: pushes.iter().any(|p| p.scope == "all" && p.pushed_on == today),
        badges: badges(total_days, longest_streak),
        calendar,
        by_chore,
    }
}

// ---------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------

pub async fn today(db: &PgPool) -> ApiResult<NaiveDate> {
    let (d,): (NaiveDate,) = sqlx::query_as(&format!("SELECT {TODAY_SQL}")).fetch_one(db).await?;
    Ok(d)
}

async fn family_chores(db: &PgPool, family_id: Uuid) -> ApiResult<Vec<Chore>> {
    Ok(sqlx::query_as(
        "SELECT id, name, icon, description, duration_minutes, frequency_period, frequency_times, position, archived FROM chores WHERE family_id = $1 ORDER BY position, created_at",
    )
    .bind(family_id)
    .fetch_all(db)
    .await?)
}

/// 家族のコミットを (ユーザー, 家事, 日付) で返す。user を指定するとその人だけ。
async fn family_commits(db: &PgPool, family_id: Uuid, user: Option<Uuid>) -> ApiResult<Vec<(Uuid, Uuid, NaiveDate)>> {
    Ok(sqlx::query_as(
        "SELECT cc.user_id, cc.chore_id, cc.committed_on
           FROM chore_commits cc JOIN chores c ON c.id = cc.chore_id
          WHERE c.family_id = $1 AND ($2::uuid IS NULL OR cc.user_id = $2)",
    )
    .bind(family_id)
    .bind(user)
    .fetch_all(db)
    .await?)
}

fn commits_of(rows: &[(Uuid, Uuid, NaiveDate)], user_id: Uuid) -> Vec<(Uuid, NaiveDate)> {
    rows.iter().filter(|r| r.0 == user_id).map(|r| (r.1, r.2)).collect()
}

/// 家族のプッシュを返す。user を指定するとその人だけ。
async fn family_pushes(db: &PgPool, family_id: Uuid, user: Option<Uuid>) -> ApiResult<Vec<PushRow>> {
    Ok(sqlx::query_as(
        "SELECT user_id, scope, pushed_on, period_start FROM chore_pushes
          WHERE family_id = $1 AND ($2::uuid IS NULL OR user_id = $2)",
    )
    .bind(family_id)
    .bind(user)
    .fetch_all(db)
    .await?)
}

fn pushes_of(rows: &[PushRow], user_id: Uuid) -> Vec<PushRow> {
    rows.iter().filter(|r| r.user_id == user_id).cloned().collect()
}

/// 1 人分の家事の実績 (稟議の詳細画面でレビュアーに見せる)
pub async fn contributions(db: &PgPool, family_id: Uuid, user_id: Uuid) -> ApiResult<ContributionSummary> {
    let chores = family_chores(db, family_id).await?;
    let rows = family_commits(db, family_id, Some(user_id)).await?;
    let pushes = family_pushes(db, family_id, Some(user_id)).await?;
    Ok(summarize(user_id, &commits_of(&rows, user_id), &pushes_of(&pushes, user_id), &chores, today(db).await?))
}

async fn build_resp(state: &AppState, family_id: Uuid, me: Uuid) -> ApiResult<ChoresResp> {
    let today = today(&state.db).await?;
    let chores = family_chores(&state.db, family_id).await?;
    let rows = family_commits(&state.db, family_id, None).await?;
    let pushes = family_pushes(&state.db, family_id, None).await?;
    let members: Vec<UserRef> = sqlx::query_as(
        "SELECT u.id, u.name, u.avatar_url FROM users u JOIN family_members m ON m.user_id = u.id
          WHERE m.family_id = $1 ORDER BY m.created_at",
    )
    .bind(family_id)
    .fetch_all(&state.db)
    .await?;

    let images: Vec<ChoreImage> = sqlx::query_as(
        "SELECT i.* FROM chore_images i JOIN chores c ON c.id = i.chore_id
          WHERE c.family_id = $1 ORDER BY i.position, i.created_at",
    )
    .bind(family_id)
    .fetch_all(&state.db)
    .await?;

    let my_commits = commits_of(&rows, me);
    let my_pushes = pushes_of(&pushes, me);
    let mine = summarize(me, &my_commits, &my_pushes, &chores, today);
    let pushed_all = has_pushed(&my_pushes, "all", today);
    let chore_list: Vec<ChoreStatus> = chores
        .iter()
        .map(|c| {
            let stat = mine.by_chore.iter().find(|s| s.chore_id == c.id);
            let committed_today = my_commits.iter().any(|r| r.0 == c.id && r.1 == today);
            // 頻度が未設定の家事は今日の分だけで数える
            let own = c.frequency_period.as_deref().unwrap_or("day");
            let (period_done, period_target) = progress(c, own, &my_commits, today);
            let locked = committed_today
                && (pushed_all || c.frequency_period.as_deref().is_some_and(|p| has_pushed(&my_pushes, p, today)));
            ChoreStatus {
                chore: c.clone(),
                committed_today,
                days: stat.map_or(0, |s| s.days),
                current_streak: stat.map_or(0, |s| s.current_streak),
                period_done,
                period_target,
                locked,
                images: images.iter().filter(|i| i.chore_id == c.id).cloned().collect(),
            }
        })
        .collect();
    let members = members
        .into_iter()
        .map(|u| {
            let summary = summarize(u.id, &commits_of(&rows, u.id), &pushes_of(&pushes, u.id), &chores, today);
            MemberContribution { user: u, summary }
        })
        .collect();
    let active: Vec<&Chore> = chores.iter().filter(|c| !c.archived).collect();
    let push_list = push_statuses(&active, &my_commits, &my_pushes, today);
    let can_push = push_list.iter().any(|p| p.scope == "all" && p.can_push);
    Ok(ChoresResp { today, chores: chore_list, can_push, pushes: push_list, me: mine, members })
}

/// 同じ家族の家事を取得する。他の家族の家事は存在しない扱い。
async fn load_chore(state: &AppState, family_id: Uuid, id: Uuid) -> ApiResult<Chore> {
    sqlx::query_as("SELECT id, name, icon, description, duration_minutes, frequency_period, frequency_times, position, archived FROM chores WHERE id = $1 AND family_id = $2")
        .bind(id)
        .bind(family_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(ApiError::NotFound)
}

/// 入力をそろえて (名前, アイコン, 説明) を返す
/// 保存する家事の項目
struct ChoreFields {
    name: String,
    icon: String,
    description: String,
    duration_minutes: Option<i32>,
    frequency_period: Option<String>,
    frequency_times: Option<i32>,
}

fn validate(input: &ChoreInput) -> ApiResult<ChoreFields> {
    let name = input.name.trim();
    if name.is_empty() || name.chars().count() > 30 {
        return Err(ApiError::BadRequest("家事の名前を30文字以内で入力してください".into()));
    }
    // 未入力なら名前から選ぶ (以前は ✅ にしていたが、「コミット済み」に見えるのでやめた)
    let icon = input.icon.as_deref().map(str::trim).filter(|s| !s.is_empty()).unwrap_or_else(|| guess_icon(name));
    if icon.chars().count() > 8 {
        return Err(ApiError::BadRequest("アイコンは絵文字1つにしてください".into()));
    }
    let description = input.description.as_deref().map(str::trim).unwrap_or("");
    if description.chars().count() > MAX_DESCRIPTION {
        return Err(ApiError::BadRequest(format!("説明は{MAX_DESCRIPTION}文字以内で入力してください")));
    }
    if input.duration_minutes.is_some_and(|m| !(1..=1440).contains(&m)) {
        return Err(ApiError::BadRequest("所要時間は1〜1440分で入力してください".into()));
    }
    // 頻度は「期間」と「回数」の両方があるときだけ保存する (片方だけなら未設定とみなす)
    let period = input.frequency_period.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let (frequency_period, frequency_times) = match (period, input.frequency_times) {
        (Some(p), Some(n)) => {
            if !matches!(p, "day" | "week" | "month") {
                return Err(ApiError::BadRequest("頻度の期間が正しくありません".into()));
            }
            let max = match p { "day" => 10, "week" => 14, _ => 31 };
            if !(1..=max).contains(&n) {
                return Err(ApiError::BadRequest(format!("頻度の回数は1〜{max}回で入力してください")));
            }
            (Some(p.to_string()), Some(n))
        }
        _ => (None, None),
    };
    Ok(ChoreFields {
        name: name.to_string(),
        icon: icon.to_string(),
        description: description.to_string(),
        duration_minutes: input.duration_minutes,
        frequency_period,
        frequency_times,
    })
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

pub async fn list(State(state): State<AppState>, AuthUser(me): AuthUser) -> ApiResult<Json<ChoresResp>> {
    Ok(Json(build_resp(&state, me.family_id, me.id).await?))
}

pub async fn create(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(input): Json<ChoreInput>,
) -> ApiResult<Json<ChoresResp>> {
    auth.require_admin()?;
    let me = &auth.0;
    let f = validate(&input)?;
    let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM chores WHERE family_id = $1")
        .bind(me.family_id)
        .fetch_one(&state.db)
        .await?;
    if count >= MAX_CHORES {
        return Err(ApiError::BadRequest(format!("家事は{MAX_CHORES}件までです")));
    }
    sqlx::query(
        "INSERT INTO chores (family_id, name, icon, description, duration_minutes, frequency_period, frequency_times, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT COALESCE(MAX(position) + 1, 0) FROM chores WHERE family_id = $1))",
    )
    .bind(me.family_id)
    .bind(f.name)
    .bind(f.icon)
    .bind(f.description)
    .bind(f.duration_minutes)
    .bind(f.frequency_period)
    .bind(f.frequency_times)
    .execute(&state.db)
    .await?;
    Ok(Json(build_resp(&state, me.family_id, me.id).await?))
}

/// 名前・アイコン・説明・所要時間・推奨頻度の変更と、非表示 / 再表示 (非表示にしても過去の実績は残る)
pub async fn update(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(input): Json<ChoreInput>,
) -> ApiResult<Json<ChoresResp>> {
    auth.require_admin()?;
    let me = &auth.0;
    let f = validate(&input)?;
    load_chore(&state, me.family_id, id).await?;
    sqlx::query(
        "UPDATE chores SET name = $1, icon = $2, description = $3, archived = $4,
                duration_minutes = $6, frequency_period = $7, frequency_times = $8
          WHERE id = $5",
    )
        .bind(f.name)
        .bind(f.icon)
        .bind(f.description)
        .bind(input.archived)
        .bind(id)
        .bind(f.duration_minutes)
        .bind(f.frequency_period)
        .bind(f.frequency_times)
        .execute(&state.db)
        .await?;
    Ok(Json(build_resp(&state, me.family_id, me.id).await?))
}

/// 並び順を変える (管理者)。家族の家事をすべて、表示したい順に受け取る。
pub async fn reorder(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(input): Json<ChoreOrder>,
) -> ApiResult<Json<ChoresResp>> {
    auth.require_admin()?;
    let me = &auth.0;
    let current: Vec<(Uuid,)> = sqlx::query_as("SELECT id FROM chores WHERE family_id = $1")
        .bind(me.family_id)
        .fetch_all(&state.db)
        .await?;
    // 途中で家事が追加・変更されていたら、古い画面の順番で上書きしないよう受け付けない
    let mut want: Vec<Uuid> = input.ids.clone();
    let mut have: Vec<Uuid> = current.into_iter().map(|r| r.0).collect();
    want.sort();
    have.sort();
    if want != have {
        return Err(ApiError::Conflict("家事の項目が変わっています。画面を読み込み直してください".into()));
    }
    let positions: Vec<i32> = (0..input.ids.len() as i32).collect();
    sqlx::query(
        "UPDATE chores c SET position = o.position
           FROM UNNEST($1::uuid[], $2::int[]) AS o(id, position)
          WHERE c.id = o.id AND c.family_id = $3",
    )
    .bind(&input.ids)
    .bind(&positions)
    .bind(me.family_id)
    .execute(&state.db)
    .await?;
    Ok(Json(build_resp(&state, me.family_id, me.id).await?))
}

/// 今日の分をコミットする。1 日 1 回なので、2 回目は何もしない。
pub async fn commit(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<ChoresResp>> {
    let chore = load_chore(&state, me.family_id, id).await?;
    if chore.archived {
        return Err(ApiError::Conflict("非表示の家事にはコミットできません".into()));
    }
    sqlx::query(&format!(
        "INSERT INTO chore_commits (chore_id, user_id, committed_on) VALUES ($1, $2, {TODAY_SQL})
         ON CONFLICT DO NOTHING"
    ))
    .bind(id)
    .bind(me.id)
    .execute(&state.db)
    .await?;
    Ok(Json(build_resp(&state, me.family_id, me.id).await?))
}

/// 今日のコミットを取り消す (押し間違い用。過去の日の分は取り消せない)
pub async fn uncommit(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<ChoresResp>> {
    let chore = load_chore(&state, me.family_id, id).await?;
    let today = today(&state.db).await?;
    // 「すべて」を今日プッシュしたか、この家事の頻度の種類を今の期間にプッシュしていたら、
    // 今日のコミットは確定済みなので取り消せない (同じ文で判定して、プッシュとの競合を防ぐ)
    let scope = chore.frequency_period.as_deref();
    let start = period_start(scope.unwrap_or("all"), today);
    let deleted = sqlx::query(
        "DELETE FROM chore_commits WHERE chore_id = $1 AND user_id = $2 AND committed_on = $3
            AND NOT EXISTS (SELECT 1 FROM chore_pushes WHERE user_id = $2
                  AND ((scope = 'all' AND period_start = $3) OR (scope = $4 AND period_start = $5)))",
    )
    .bind(id)
    .bind(me.id)
    .bind(today)
    .bind(scope)
    .bind(start)
    .execute(&state.db)
    .await?;
    if deleted.rows_affected() == 0 {
        let pushes = family_pushes(&state.db, me.family_id, Some(me.id)).await?;
        if has_pushed(&pushes, "all", today) || scope.is_some_and(|p| has_pushed(&pushes, p, today)) {
            return Err(ApiError::Conflict("プッシュ済みなので、今日のコミットは取り消せません".into()));
        }
    }
    Ok(Json(build_resp(&state, me.family_id, me.id).await?))
}

/// 種類 (すべて / 毎日 / 週 / 月) ごとに、対象の家事 (非表示を除く) をすべてクリアしていたら、
/// プッシュしてその種類のトロフィーを取る。all と day は今日 1 回、week は今週 1 回、month は今月 1 回。
/// プッシュは取り消せない実績として残り、対象の家事の今日のコミットも取り消せなくなる。
pub async fn push(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    input: Option<Json<PushInput>>,
) -> ApiResult<Json<ChoresResp>> {
    let key = input.and_then(|Json(i)| i.scope).unwrap_or_else(|| "all".into());
    let scope = push_scope(&key).ok_or_else(|| ApiError::BadRequest("プッシュの種類が正しくありません".into()))?;
    let today = today(&state.db).await?;
    let start = period_start(scope.key, today);
    // 「クリアしていない家事がない」ことの確認と記録を 1 文で行う。
    // クリア = 期間の初日から今日までに、推奨の回数 (all / day は 1 回。期間の日数が上限) の日数コミットした
    let inserted = sqlx::query(
        "INSERT INTO chore_pushes (family_id, user_id, scope, pushed_on, period_start, chore_count)
         SELECT $1, $2, $3, $4, $5, COUNT(*) FROM chores c
          WHERE c.family_id = $1 AND NOT c.archived AND ($3 = 'all' OR c.frequency_period = $3)
         HAVING COUNT(*) > 0
            AND bool_and((SELECT COUNT(*) FROM chore_commits cc
                           WHERE cc.chore_id = c.id AND cc.user_id = $2 AND cc.committed_on BETWEEN $5 AND $4)
                         >= LEAST(GREATEST(COALESCE(c.frequency_times, 1), 1), $6))
         ON CONFLICT (user_id, scope, period_start) DO NOTHING",
    )
    .bind(me.family_id)
    .bind(me.id)
    .bind(scope.key)
    .bind(today)
    .bind(start)
    .bind(target_cap(scope.key, today))
    .execute(&state.db)
    .await?;
    if inserted.rows_affected() == 0 {
        let resp = build_resp(&state, me.family_id, me.id).await?;
        let pushed = resp.pushes.iter().any(|p| p.scope == scope.key && p.pushed);
        return Err(ApiError::Conflict(if pushed {
            format!("{}の「{}」はもうプッシュしています", scope.period, scope.label)
        } else {
            scope.hint.into()
        }));
    }
    Ok(Json(build_resp(&state, me.family_id, me.id).await?))
}

/// 家族メンバー 1 人の実績
pub async fn member_contributions(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Path(user_id): Path<Uuid>,
) -> ApiResult<Json<ContributionSummary>> {
    let (same_family,): (bool,) =
        sqlx::query_as("SELECT EXISTS (SELECT 1 FROM family_members WHERE user_id = $1 AND family_id = $2)")
            .bind(user_id)
            .bind(me.family_id)
            .fetch_one(&state.db)
            .await?;
    if !same_family {
        return Err(ApiError::NotFound);
    }
    Ok(Json(contributions(&state.db, me.family_id, user_id).await?))
}

// ---------------------------------------------------------------------------
// 見本画像 (きれいな状態 = 保つべき状態)
// ---------------------------------------------------------------------------

/// 見本は画面に並べて表示するので、ブラウザで表示できる画像だけ受け付ける
fn is_sample_image(ct: &str) -> bool {
    matches!(ct.to_ascii_lowercase().as_str(), "image/jpeg" | "image/png" | "image/webp")
}

fn validate_caption(caption: &str) -> ApiResult<String> {
    let caption = caption.trim();
    if caption.chars().count() > MAX_DESCRIPTION {
        return Err(ApiError::BadRequest(format!("画像の説明は{MAX_DESCRIPTION}文字以内で入力してください")));
    }
    Ok(caption.to_string())
}

/// 同じ家族の家事の見本画像を取得する。他の家族の画像は存在しない扱い。
async fn load_image(state: &AppState, family_id: Uuid, id: Uuid) -> ApiResult<ChoreImage> {
    sqlx::query_as(
        "SELECT i.* FROM chore_images i JOIN chores c ON c.id = i.chore_id WHERE i.id = $1 AND c.family_id = $2",
    )
    .bind(id)
    .bind(family_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(ApiError::NotFound)
}

/// 見本画像を追加する (管理者)。multipart の file と caption (任意) を受け取る。
pub async fn upload_image(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(chore_id): Path<Uuid>,
    mut multipart: Multipart,
) -> ApiResult<Json<ChoresResp>> {
    auth.require_admin()?;
    let me = &auth.0;
    load_chore(&state, me.family_id, chore_id).await?;
    let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM chore_images WHERE chore_id = $1")
        .bind(chore_id)
        .fetch_one(&state.db)
        .await?;
    if count >= MAX_IMAGES {
        return Err(ApiError::BadRequest(format!("見本の画像は1つの家事につき{MAX_IMAGES}枚までです")));
    }

    let mut file: Option<(String, String, axum::body::Bytes)> = None;
    let mut caption = String::new();
    while let Some(field) = multipart.next_field().await? {
        match field.name() {
            Some("file") => {
                let name = field.file_name().unwrap_or("image").to_string();
                let ct = resolve_content_type(field.content_type(), &name);
                file = Some((name, ct, field.bytes().await?));
            }
            Some("caption") => caption = field.text().await?,
            _ => {}
        }
    }
    let (file_name, content_type, bytes) = file.ok_or_else(|| ApiError::BadRequest("画像を選択してください".into()))?;
    if !is_sample_image(&content_type) {
        return Err(ApiError::BadRequest("画像 (JPG・PNG・WEBP) を選択してください".into()));
    }
    if bytes.is_empty() || bytes.len() > MAX_BYTES {
        return Err(ApiError::BadRequest("画像が大きすぎます (最大10MB)".into()));
    }
    let caption = validate_caption(&caption)?;

    let storage_key = format!("chores/{chore_id}/{}", Uuid::new_v4());
    let path = std::path::PathBuf::from(&state.config.upload_dir).join(&storage_key);
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let mut f = tokio::fs::File::create(&path).await?;
    f.write_all(&bytes).await?;
    f.flush().await?;

    sqlx::query(
        "INSERT INTO chore_images (chore_id, file_name, content_type, byte_size, storage_key, caption, uploaded_by, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT COALESCE(MAX(position) + 1, 0) FROM chore_images WHERE chore_id = $1))",
    )
    .bind(chore_id)
    .bind(&file_name)
    .bind(&content_type)
    .bind(bytes.len() as i64)
    .bind(&storage_key)
    .bind(&caption)
    .bind(me.id)
    .execute(&state.db)
    .await?;
    Ok(Json(build_resp(&state, me.family_id, me.id).await?))
}

/// 見本画像の説明を変更する (管理者)
pub async fn update_image(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(input): Json<ChoreImageUpdate>,
) -> ApiResult<Json<ChoresResp>> {
    auth.require_admin()?;
    let me = &auth.0;
    load_image(&state, me.family_id, id).await?;
    sqlx::query("UPDATE chore_images SET caption = $1 WHERE id = $2")
        .bind(validate_caption(&input.caption)?)
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(build_resp(&state, me.family_id, me.id).await?))
}

/// 見本画像を削除する (管理者)。ファイルの実体も消す。
pub async fn delete_image(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<ChoresResp>> {
    auth.require_admin()?;
    let me = &auth.0;
    let img = load_image(&state, me.family_id, id).await?;
    sqlx::query("DELETE FROM chore_images WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    tokio::fs::remove_file(std::path::PathBuf::from(&state.config.upload_dir).join(&img.storage_key))
        .await
        .ok();
    Ok(Json(build_resp(&state, me.family_id, me.id).await?))
}

/// 見本画像の本体 (同じ家族のメンバーなら誰でも見られる)
pub async fn image(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    let img = load_image(&state, me.family_id, id).await?;
    serve_file(&state, &img.storage_key, &img.file_name, img.content_type).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    fn set(days: &[&str]) -> BTreeSet<NaiveDate> {
        days.iter().map(|s| d(s)).collect()
    }

    fn push_row(scope: &str, on: &str) -> PushRow {
        PushRow { user_id: Uuid::nil(), scope: scope.into(), pushed_on: d(on), period_start: period_start(scope, d(on)) }
    }

    fn chore(id: u128, period: Option<&str>, times: Option<i32>) -> Chore {
        Chore {
            id: Uuid::from_u128(id),
            name: format!("家事{id}"),
            icon: "🏠".into(),
            description: String::new(),
            duration_minutes: None,
            frequency_period: period.map(str::to_string),
            frequency_times: times,
            position: 0,
            archived: false,
        }
    }

    #[test]
    fn periods_start_on_sunday_and_the_first() {
        // 2026-09-24 は木曜
        assert_eq!(period_start("week", d("2026-09-24")), d("2026-09-20"));
        assert_eq!(period_start("week", d("2026-09-20")), d("2026-09-20"));
        assert_eq!(period_start("month", d("2026-09-24")), d("2026-09-01"));
        assert_eq!(period_start("day", d("2026-09-24")), d("2026-09-24"));
        assert_eq!(period_start("all", d("2026-09-24")), d("2026-09-24"));
        assert_eq!(target_cap("month", d("2026-02-10")), 28);
        assert_eq!(target_cap("month", d("2026-09-24")), 30);
    }

    #[test]
    fn each_scope_is_cleared_separately() {
        let today = d("2026-09-24");
        let daily = chore(1, Some("day"), Some(1));
        let weekly = chore(2, Some("week"), Some(2));
        let monthly = chore(3, Some("month"), Some(1));
        let free = chore(4, None, None);
        let chores = vec![&daily, &weekly, &monthly, &free];
        let status = |commits: &[(Uuid, NaiveDate)], pushes: &[PushRow]| {
            push_statuses(&chores, commits, pushes, today)
                .into_iter()
                .map(|p| (p.scope, p.done, p.total, p.can_push, p.pushed))
                .collect::<Vec<_>>()
        };

        // 毎日の家事を今日やり、週の家事は今週 1 回だけ (先週の分は数えない)、月の家事は今月 1 回
        let commits = vec![
            (daily.id, today),
            (weekly.id, d("2026-09-19")),
            (weekly.id, d("2026-09-21")),
            (monthly.id, d("2026-09-02")),
        ];
        assert_eq!(
            status(&commits, &[]),
            vec![
                ("all", 1, 4, false, false),
                ("day", 1, 1, true, false),
                ("week", 0, 1, false, false),
                ("month", 1, 1, true, false),
            ]
        );
        assert_eq!(progress(&weekly, "week", &commits, today), (1, 2));

        // 週 2 回目をやるとクリア。毎日はプッシュ済みなのでもう押せない
        let mut commits = commits;
        commits.push((weekly.id, today));
        let pushes = vec![push_row("day", "2026-09-24"), push_row("month", "2026-09-05")];
        let got = status(&commits, &pushes);
        assert_eq!(got[1], ("day", 1, 1, false, true));
        assert_eq!(got[2], ("week", 1, 1, true, false));
        assert_eq!(got[3], ("month", 1, 1, false, true));
    }

    #[test]
    fn scope_without_chores_cannot_be_pushed() {
        let only_daily = chore(1, Some("day"), Some(1));
        let got = push_statuses(&[&only_daily], &[(only_daily.id, d("2026-09-24"))], &[], d("2026-09-24"));
        let week = got.iter().find(|p| p.scope == "week").unwrap();
        assert_eq!((week.total, week.can_push), (0, false));
    }

    #[test]
    fn streak_continues_through_today() {
        let days = set(&["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23"]);
        assert_eq!(streaks(&days, d("2026-09-23")), (4, 4));
    }

    #[test]
    fn streak_is_alive_until_today_is_over() {
        // 今日はまだコミットしていないが、昨日までの連続は途切れていない
        let days = set(&["2026-09-21", "2026-09-22"]);
        assert_eq!(streaks(&days, d("2026-09-23")), (2, 2));
    }

    #[test]
    fn streak_breaks_after_a_missed_day() {
        let days = set(&["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-21"]);
        assert_eq!(streaks(&days, d("2026-09-23")), (0, 3));
    }

    #[test]
    fn empty_has_no_streak_or_badges() {
        let s = summarize(Uuid::nil(), &[], &[], &[], d("2026-09-23"));
        assert_eq!((s.current_streak, s.longest_streak, s.total_days), (0, 0, 0));
        assert!(s.badges.is_empty());
        assert!(!s.committed_today);
    }

    #[test]
    fn summarize_counts_days_not_commits() {
        let chore_a = Uuid::from_u128(1);
        let chore_b = Uuid::from_u128(2);
        let chores = vec![
            Chore { id: chore_a, name: "掃除".into(), icon: "🧹".into(), description: String::new(), duration_minutes: None, frequency_period: None, frequency_times: None, position: 0, archived: false },
            Chore { id: chore_b, name: "洗濯".into(), icon: "👕".into(), description: String::new(), duration_minutes: None, frequency_period: None, frequency_times: None, position: 1, archived: false },
        ];
        let today = d("2026-09-23");
        let commits = vec![
            (chore_a, d("2026-09-21")),
            (chore_a, d("2026-09-22")),
            (chore_b, d("2026-09-22")),
            (chore_a, d("2026-09-23")),
            (chore_b, d("2026-08-01")), // 30 日より前
        ];
        let pushes = vec![
            push_row("all", "2026-09-22"),
            push_row("all", "2026-09-23"),
            push_row("week", "2026-09-23"),
            push_row("all", "2026-10-01"), // 未来の日は数えない
        ];
        let s = summarize(Uuid::nil(), &commits, &pushes, &chores, today);
        assert_eq!((s.trophies, s.pushed_today), (3, true));
        let counts: Vec<(&str, i64)> = s.trophy_counts.iter().map(|t| (t.scope, t.count)).collect();
        assert_eq!(counts, vec![("all", 2), ("day", 0), ("week", 1), ("month", 0)]);
        assert!(s.calendar.iter().find(|c| c.date == d("2026-09-22")).unwrap().pushed);
        assert!(!s.calendar.iter().find(|c| c.date == d("2026-09-21")).unwrap().pushed);
        assert_eq!(s.total_days, 4);
        assert_eq!(s.total_commits, 5);
        assert_eq!(s.last_30_days, 3);
        assert_eq!((s.current_streak, s.longest_streak), (3, 3));
        assert!(s.committed_today);
        let keys: Vec<&str> = s.badges.iter().map(|b| b.key).collect();
        assert_eq!(keys, vec!["first", "streak_3"]);
        let a = s.by_chore.iter().find(|c| c.chore_id == chore_a).unwrap();
        assert_eq!((a.days, a.current_streak), (3, 3));
        let b = s.by_chore.iter().find(|c| c.chore_id == chore_b).unwrap();
        // 洗濯は昨日やったので、今日まだでも連続 1 日
        assert_eq!((b.days, b.current_streak), (2, 1));
        // 草グラフは日曜始まりで今日まで。2026-09-23 は水曜なので 11 週 + 4 日
        assert_eq!(s.calendar.len(), 7 * 11 + 4);
        assert_eq!(s.calendar.first().unwrap().date.weekday(), chrono::Weekday::Sun);
        assert_eq!(s.calendar.last().unwrap().date, today);
        assert_eq!(s.calendar.last().unwrap().count, 1);
    }

    #[test]
    fn icon_is_guessed_from_the_name() {
        assert_eq!(guess_icon("お風呂掃除/片付け"), "🛁");
        assert_eq!(guess_icon("トイレ掃除/片付け"), "🚽");
        assert_eq!(guess_icon("洗面所掃除/片付け"), "🪥");
        assert_eq!(guess_icon("オレオとお散歩/オレオとかくれんぼ"), "🐾");
        assert_eq!(guess_icon("掃除機をかける"), "🧹");
        assert_eq!(guess_icon("町内会の当番"), "🏠");
    }

    fn chore_input(minutes: Option<i32>, period: Option<&str>, times: Option<i32>) -> ChoreInput {
        ChoreInput {
            name: "掃除".into(),
            icon: None,
            description: None,
            duration_minutes: minutes,
            frequency_period: period.map(str::to_string),
            frequency_times: times,
            archived: false,
        }
    }

    #[test]
    fn duration_and_frequency_are_validated() {
        let f = validate(&chore_input(Some(20), Some("week"), Some(2))).unwrap();
        assert_eq!((f.duration_minutes, f.frequency_period.as_deref(), f.frequency_times), (Some(20), Some("week"), Some(2)));
        // 片方だけの頻度は未設定として扱う
        let f = validate(&chore_input(None, Some("week"), None)).unwrap();
        assert_eq!((f.frequency_period, f.frequency_times), (None, None));
        assert!(validate(&chore_input(Some(0), None, None)).is_err());
        assert!(validate(&chore_input(Some(1441), None, None)).is_err());
        assert!(validate(&chore_input(None, Some("year"), Some(1))).is_err());
        assert!(validate(&chore_input(None, Some("day"), Some(11))).is_err());
        assert!(validate(&chore_input(None, Some("month"), Some(31))).is_ok());
    }

    #[test]
    fn badges_are_kept_after_streak_breaks() {
        let keys: Vec<&str> = badges(12, 8).iter().map(|b| b.key).collect();
        assert_eq!(keys, vec!["first", "streak_3", "streak_7", "total_10"]);
    }
}
