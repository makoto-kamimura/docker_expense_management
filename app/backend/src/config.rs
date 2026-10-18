use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub bind_addr: String,
    pub upload_dir: String,
    /// Web Push の VAPID 秘密鍵 (base64url)。未指定なら初回起動時に作って DB に保存する
    pub vapid_private_key: Option<String>,
    /// VAPID の連絡先 (mailto: か https:)。プッシュサービスが問題のある送信元に連絡するときに使う
    pub vapid_subject: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            database_url: env::var("DATABASE_URL")
                .map_err(|_| anyhow::anyhow!("DATABASE_URL is required"))?,
            jwt_secret: env::var("JWT_SECRET")
                .map_err(|_| anyhow::anyhow!("JWT_SECRET is required"))?,
            bind_addr: env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".into()),
            upload_dir: env::var("UPLOAD_DIR").unwrap_or_else(|_| "./uploads".into()),
            vapid_private_key: env::var("VAPID_PRIVATE_KEY").ok(),
            vapid_subject: env::var("VAPID_SUBJECT").unwrap_or_else(|_| "mailto:admin@example.com".into()),
        })
    }
}
