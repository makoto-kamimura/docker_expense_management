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
    /// SSO (OpenID Connect)。発行元・クライアント ID・秘密がそろったときだけ有効
    pub sso: Option<SsoConfig>,
    /// 非常用の切り替え。true なら「SSO だけ」の人にもパスワードのログインを許す (認証サーバーが止まったときなど)
    pub allow_password_for_sso_only: bool,
}

/// SSO (OpenID Connect) の設定。接続先 (認証サーバー) のエンドポイントと公開鍵は、
/// 発行元の `/.well-known/openid-configuration` から読む
#[derive(Clone, Debug)]
pub struct SsoConfig {
    /// 発行元 (例: https://auth.example.com/auth/v1/)。ID トークンの `iss` と一致する必要がある
    pub issuer: String,
    pub client_id: String,
    pub client_secret: String,
    /// 外から見えるこのアプリの URL (例: https://expense.example.com)。
    /// 認証サーバーに登録するリダイレクト URI は `{public_base_url}/api/auth/sso/callback`
    pub public_base_url: String,
    /// 画面に出す名前 (ボタンの「◯◯ でログイン」)
    pub display_name: String,
    pub scope: String,
    /// true なら、2 段階認証 (ID トークンの `amr` に `mfa`) でログインした人だけを通す
    pub require_mfa: bool,
    /// モバイルアプリの戻り先として許す URL の先頭 (例: expense://, exp://)
    pub mobile_redirect_prefixes: Vec<String>,
    /// このドメインのメールアドレスの利用者には連携させない (誰でも入れるデモ用アカウント)
    pub link_deny_email_domains: Vec<String>,
}

/// カンマ区切りの環境変数を、空白を除いたリストにする
fn list_var(name: &str, default: &str) -> Vec<String> {
    env::var(name)
        .unwrap_or_else(|_| default.into())
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn non_empty(name: &str) -> Option<String> {
    env::var(name).ok().map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

impl SsoConfig {
    fn from_env() -> anyhow::Result<Option<Self>> {
        let (Some(issuer), Some(client_id), Some(client_secret)) =
            (non_empty("OIDC_ISSUER"), non_empty("OIDC_CLIENT_ID"), non_empty("OIDC_CLIENT_SECRET"))
        else {
            return Ok(None);
        };
        let base = non_empty("PUBLIC_BASE_URL")
            .ok_or_else(|| anyhow::anyhow!("OIDC_ISSUER を使うときは PUBLIC_BASE_URL も必要です"))?;
        if !issuer.starts_with("https://") && !issuer.starts_with("http://localhost") && !issuer.starts_with("http://127.0.0.1") {
            anyhow::bail!("OIDC_ISSUER は https の URL にしてください (手元の試験だけ http://localhost を許す)");
        }
        let require_mfa = match non_empty("OIDC_REQUIRE_MFA").as_deref() {
            None => true,
            Some("true" | "1" | "yes") => true,
            Some("false" | "0" | "no") => false,
            Some(other) => anyhow::bail!("OIDC_REQUIRE_MFA は true か false です: {other}"),
        };
        Ok(Some(Self {
            issuer,
            client_id,
            client_secret,
            public_base_url: base.trim_end_matches('/').into(),
            display_name: non_empty("OIDC_DISPLAY_NAME").unwrap_or_else(|| "SSO".into()),
            scope: non_empty("OIDC_SCOPE").unwrap_or_else(|| "openid email profile".into()),
            require_mfa,
            mobile_redirect_prefixes: list_var("OIDC_MOBILE_REDIRECT_PREFIXES", "expense://,exp://"),
            link_deny_email_domains: list_var("OIDC_LINK_DENY_EMAIL_DOMAINS", "example.com")
                .into_iter()
                .map(|d| d.to_lowercase())
                .collect(),
        }))
    }

    /// 認証サーバーから戻ってくる URL (認証サーバーにリダイレクト URI として登録するもの)
    pub fn callback_url(&self) -> String {
        format!("{}/api/auth/sso/callback", self.public_base_url)
    }

    /// Web の戻り先 (Next.js がコードを交換して Cookie に入れる)
    pub fn web_return_url(&self) -> String {
        format!("{}/auth/sso/complete", self.public_base_url)
    }
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
            sso: SsoConfig::from_env()?,
            allow_password_for_sso_only: matches!(
                non_empty("OIDC_ALLOW_PASSWORD_FOR_SSO_ONLY").as_deref(),
                Some("true" | "1" | "yes")
            ),
        })
    }
}
