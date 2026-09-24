mod auth;
mod config;
mod error;
mod handlers;
mod migrate;
mod models;
mod previews;
mod seed;
mod state;

use std::net::SocketAddr;

use axum::{
    extract::DefaultBodyLimit,
    routing::{get, post, put},
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

    migrate::run(&state.db).await?;
    seed::seed(&state).await?;
    // 既存の稟議の URL のプレビューをバックグラウンドで取得する
    previews::backfill(&state).await?;

    let app = Router::new()
        .route("/health", get(handlers::health::health))
        .route("/auth/register", post(handlers::auth::register))
        .route("/auth/login", post(handlers::auth::login))
        .route("/me", get(handlers::auth::me))
        .route("/me/onboarded", post(handlers::auth::complete_onboarding))
        .route("/ocr", post(handlers::ocr::scan))
        .route("/family", get(handlers::family::get).put(handlers::family::update))
        .route("/family/invite-code", post(handlers::family::regenerate_invite_code))
        .route("/family/members", get(handlers::family::members))
        .route("/family/members/:user_id", put(handlers::family::update_member))
        .route("/family/members/:user_id/contributions", get(handlers::chores::member_contributions))
        .route("/chores", get(handlers::chores::list).post(handlers::chores::create))
        .route("/chores/order", put(handlers::chores::reorder))
        .route("/chores/push", post(handlers::chores::push))
        .route("/chores/:id", put(handlers::chores::update))
        .route(
            "/chores/:id/commit",
            post(handlers::chores::commit).delete(handlers::chores::uncommit),
        )
        .route(
            "/chores/:id/images",
            post(handlers::chores::upload_image).layer(DefaultBodyLimit::max(handlers::attachments::UPLOAD_BODY_LIMIT)),
        )
        .route(
            "/chore-images/:id",
            get(handlers::chores::image)
                .put(handlers::chores::update_image)
                .delete(handlers::chores::delete_image),
        )
        .route("/dashboard", get(handlers::dashboard::get))
        .route("/requests", get(handlers::requests::list).post(handlers::requests::create))
        .route(
            "/requests/:id",
            get(handlers::requests::get_one)
                .put(handlers::requests::update)
                .delete(handlers::requests::delete),
        )
        .route("/requests/:id/submit", post(handlers::requests::submit))
        .route("/requests/:id/approve", post(handlers::requests::approve))
        .route("/requests/:id/request-changes", post(handlers::requests::request_changes))
        .route("/requests/:id/reject", post(handlers::requests::reject))
        .route("/requests/:id/merge", post(handlers::requests::merge))
        .route("/requests/:id/purchase", post(handlers::requests::mark_purchased))
        .route("/requests/:id/close", post(handlers::requests::close))
        .route("/requests/:id/reopen", post(handlers::requests::reopen))
        .route("/requests/:id/comments", post(handlers::requests::comment))
        .route("/requests/:id/labels", put(handlers::labels::set_request_labels))
        .route("/labels", get(handlers::labels::list).post(handlers::labels::create))
        .route("/labels/:id", put(handlers::labels::update).delete(handlers::labels::delete))
        .route(
            "/requests/:id/attachments",
            post(handlers::attachments::upload).layer(DefaultBodyLimit::max(handlers::attachments::UPLOAD_BODY_LIMIT)),
        )
        .route(
            "/attachments/:id",
            get(handlers::attachments::download).delete(handlers::attachments::delete),
        )
        .route("/attachments/:id/link", get(handlers::attachments::link))
        .route("/attachments/:id/raw", get(handlers::attachments::raw))
        .route("/link-previews/:id/image", get(handlers::link_previews::image))
        .with_state(state)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http());

    let addr: SocketAddr = cfg.bind_addr.parse()?;
    tracing::info!("listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
