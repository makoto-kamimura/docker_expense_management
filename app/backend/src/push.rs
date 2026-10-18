//! Web Push (ブラウザの通知)。通知 (notifications) を作ったあとに、受け取る人の購読先へ送る。
//! VAPID の鍵は環境変数 VAPID_PRIVATE_KEY か、なければ初回起動時に作って DB (server_keys) に保存したものを使う。

use std::time::Duration;

use anyhow::{anyhow, bail, Context};
use base64ct::{Base64UrlUnpadded, Encoding};
use reqwest::{redirect::Policy, Url};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;
use web_push_native::{
    jwt_simple::algorithms::{ECDSAP256PublicKeyLike as _, ES256KeyPair},
    p256::PublicKey,
    Auth, WebPushBuilder,
};

use crate::{handlers::notifications::message, previews::resolve_public, state::AppState};

const TIMEOUT: Duration = Duration::from_secs(10);
/// 届けられなかった通知を、プッシュサービスが持っておく時間
const TTL: Duration = Duration::from_secs(24 * 60 * 60);
const VAPID_KEY_NAME: &str = "vapid_private_key";

pub struct Vapid {
    key: ES256KeyPair,
    /// ブラウザの pushManager.subscribe に渡す公開鍵 (非圧縮の P-256 を base64url)
    pub public_key: String,
    subject: String,
}

/// VAPID の鍵を読み込む (なければ作って保存する)
pub async fn load_vapid(db: &PgPool, env_key: Option<&str>, subject: &str) -> anyhow::Result<Vapid> {
    let encoded = match env_key.map(str::trim).filter(|k| !k.is_empty()) {
        Some(k) => k.to_string(),
        None => {
            let fresh = Base64UrlUnpadded::encode_string(&ES256KeyPair::generate().to_bytes());
            // 複数のプロセスが同時に起動しても、先に保存した鍵にそろえる
            sqlx::query("INSERT INTO server_keys (name, value) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING")
                .bind(VAPID_KEY_NAME)
                .bind(&fresh)
                .execute(db)
                .await?;
            let (saved,): (String,) = sqlx::query_as("SELECT value FROM server_keys WHERE name = $1")
                .bind(VAPID_KEY_NAME)
                .fetch_one(db)
                .await?;
            saved
        }
    };
    let bytes = Base64UrlUnpadded::decode_vec(&encoded).map_err(|_| anyhow!("VAPID の秘密鍵が base64url ではありません"))?;
    let key = ES256KeyPair::from_bytes(&bytes).map_err(|e| anyhow!("VAPID の秘密鍵が読めません: {e}"))?;
    let public_key = Base64UrlUnpadded::encode_string(&key.public_key().public_key().to_bytes_uncompressed());
    Ok(Vapid { key, public_key, subject: subject.to_string() })
}

/// 購読の登録時に、鍵がブラウザの形式どおりかを確かめる
pub fn validate_keys(p256dh: &str, auth: &str) -> anyhow::Result<()> {
    let public = Base64UrlUnpadded::decode_vec(p256dh).map_err(|_| anyhow!("p256dh"))?;
    PublicKey::from_sec1_bytes(&public).map_err(|_| anyhow!("p256dh"))?;
    let auth = Base64UrlUnpadded::decode_vec(auth).map_err(|_| anyhow!("auth"))?;
    if auth.len() != 16 {
        bail!("auth");
    }
    Ok(())
}

/// 作った通知を Web Push で送る。呼び出し元は待たない (送れなくても操作は失敗させない)
pub fn deliver(state: &AppState, notification_ids: Vec<Uuid>) {
    if notification_ids.is_empty() || state.vapid.is_none() {
        return;
    }
    let state = state.clone();
    tokio::spawn(async move {
        if let Err(e) = deliver_all(&state, &notification_ids).await {
            tracing::warn!("web push error: {e:#}");
        }
    });
}

async fn deliver_all(state: &AppState, ids: &[Uuid]) -> anyhow::Result<()> {
    let Some(vapid) = state.vapid.as_deref() else { return Ok(()) };
    type Row = (Uuid, String, Uuid, String, Option<String>);
    let rows: Vec<Row> = sqlx::query_as(
        "SELECT n.user_id, n.kind, n.request_id, r.title, u.name
           FROM notifications n
           JOIN purchase_requests r ON r.id = n.request_id
           LEFT JOIN users u ON u.id = n.actor_id
          WHERE n.id = ANY($1)",
    )
    .bind(ids)
    .fetch_all(&state.db)
    .await?;
    for (user_id, kind, request_id, title, actor) in rows {
        let subs: Vec<(Uuid, String, String, String)> =
            sqlx::query_as("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1")
                .bind(user_id)
                .fetch_all(&state.db)
                .await?;
        if subs.is_empty() {
            continue;
        }
        let payload = json!({
            "title": title,
            "body": message(&kind, actor.as_deref()),
            "url": format!("/requests/{request_id}"),
            // 同じ稟議の通知は、通知センターで 1 件にまとめる
            "tag": request_id,
        })
        .to_string();
        for (sub_id, endpoint, p256dh, auth) in subs {
            match send(vapid, &endpoint, &p256dh, &auth, &payload).await {
                Ok(true) => {}
                // 購読が切れている (ブラウザ側で解除された) ので消す
                Ok(false) => {
                    sqlx::query("DELETE FROM push_subscriptions WHERE id = $1").bind(sub_id).execute(&state.db).await?;
                }
                Err(e) => tracing::warn!("web push to {endpoint} failed: {e:#}"),
            }
        }
    }
    Ok(())
}

/// 1 つの購読先に送る。購読が切れていれば Ok(false)
async fn send(vapid: &Vapid, endpoint: &str, p256dh: &str, auth: &str, payload: &str) -> anyhow::Result<bool> {
    let url = Url::parse(endpoint)?;
    if url.scheme() != "https" {
        bail!("endpoint must be https");
    }
    // 購読先はブラウザから受け取った URL なので、内部のアドレスには送らない
    let addr = resolve_public(&url).await?;
    let public = PublicKey::from_sec1_bytes(&Base64UrlUnpadded::decode_vec(p256dh).map_err(|_| anyhow!("p256dh"))?)?;
    let auth = Base64UrlUnpadded::decode_vec(auth).map_err(|_| anyhow!("auth"))?;
    if auth.len() != 16 {
        bail!("auth");
    }
    let request = WebPushBuilder::new(endpoint.parse()?, public, Auth::clone_from_slice(&auth))
        .with_valid_duration(TTL)
        .with_vapid(&vapid.key, &vapid.subject)
        .build(payload)?;
    let client = reqwest::Client::builder()
        .redirect(Policy::none())
        .timeout(TIMEOUT)
        // 検査済みの IP に固定して接続する
        .resolve(url.host_str().unwrap_or_default(), addr)
        .build()?;
    let resp = client.execute(reqwest::Request::try_from(request)?).await.context("send")?;
    match resp.status().as_u16() {
        200..=299 => Ok(true),
        404 | 410 => Ok(false),
        code => bail!("push service returned {code}: {}", resp.text().await.unwrap_or_default()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn subscription_keys_are_checked() {
        // ブラウザが返す形 (web-push-native の例と同じ値)
        let p256dh = "BLn9b-VR0ca83knDNZ32dCHGyjJp-1riX9ZTN40MqV8K_LpQmLqxC_DoHvqvFXO_nGdAB4W9dogZb_sM-uV4JbY";
        assert!(validate_keys(p256dh, "_ordMnz7uTCmrpBTeUV4Bw").is_ok());
        assert!(validate_keys(p256dh, "short").is_err());
        assert!(validate_keys("not-a-key", "_ordMnz7uTCmrpBTeUV4Bw").is_err());
    }
}
