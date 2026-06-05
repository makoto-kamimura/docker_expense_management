mod auth;
mod config;
mod error;
mod handlers;
mod models;
mod seed;
mod state;

use std::net::SocketAddr;

use axum::{
    routing::{get, post},
    Router,
};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::{config::Config, state::AppState};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,sqlx=warn")))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let cfg = Config::from_env()?;
    let state = AppState::new(cfg.clone()).await?;

    seed::seed_users(&state).await?;

    let app = Router::new()
        .route("/health", get(handlers::health::health))
        .route("/auth/register", post(handlers::auth::register))
        .route("/auth/login", post(handlers::auth::login))
        .route("/me", get(handlers::auth::me))
        .route("/ocr", post(handlers::ocr::scan))
        .route("/expenses", get(handlers::expenses::list).post(handlers::expenses::create))
        .route(
            "/expenses/:id",
            get(handlers::expenses::get_one)
                .put(handlers::expenses::update)
                .delete(handlers::expenses::delete),
        )
        .route("/expenses/:id/submit", post(handlers::expenses::submit))
        .route("/expenses/:id/approve", post(handlers::expenses::approve))
        .route("/expenses/:id/reject", post(handlers::expenses::reject))
        .route(
            "/expenses/:id/receipts",
            get(handlers::receipts::list).post(handlers::receipts::upload),
        )
        .route("/receipts/:id", get(handlers::receipts::download).delete(handlers::receipts::delete))
        .route("/reports/monthly", get(handlers::reports::monthly))
        .route("/reports/csv", get(handlers::reports::csv))
        .route("/users", get(handlers::users::list))
        .with_state(state)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http());

    let addr: SocketAddr = cfg.bind_addr.parse()?;
    tracing::info!("listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
