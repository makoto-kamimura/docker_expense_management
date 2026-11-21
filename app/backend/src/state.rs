use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;

use sqlx::PgPool;

use crate::{config::Config, oidc::OidcClient, push::Vapid};

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub config: Config,
    /// Web Push の鍵 (マイグレーション後に読み込む。読めなければ None で、アプリ内の通知だけになる)
    pub vapid: Option<Arc<Vapid>>,
    /// SSO (OpenID Connect)。設定がなければ None で、SSO のエンドポイントは 404 になる
    pub oidc: Option<Arc<OidcClient>>,
}

impl AppState {
    pub async fn new(config: Config) -> anyhow::Result<Self> {
        let db = PgPoolOptions::new()
            .max_connections(10)
            .connect(&config.database_url)
            .await?;

        tokio::fs::create_dir_all(&config.upload_dir).await.ok();

        let oidc = match &config.sso {
            Some(sso) => Some(Arc::new(OidcClient::new(sso.clone())?)),
            None => None,
        };

        Ok(Self { db, config, vapid: None, oidc })
    }
}
