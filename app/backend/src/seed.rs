use crate::{auth::hash_password, models::UserRole, state::AppState};

struct Seed<'a> {
    email: &'a str,
    name: &'a str,
    role: UserRole,
}

pub async fn seed_users(state: &AppState) -> anyhow::Result<()> {
    let seeds = [
        Seed {
            email: "admin@example.com",
            name: "管理者太郎",
            role: UserRole::Admin,
        },
        Seed {
            email: "approver@example.com",
            name: "承認花子",
            role: UserRole::Approver,
        },
        Seed {
            email: "employee@example.com",
            name: "社員次郎",
            role: UserRole::Employee,
        },
    ];

    for s in &seeds {
        let exists: Option<(uuid::Uuid,)> =
            sqlx::query_as("SELECT id FROM users WHERE email = $1")
                .bind(s.email)
                .fetch_optional(&state.db)
                .await?;
        if exists.is_some() {
            continue;
        }
        let hash = hash_password("password123").map_err(|_| anyhow::anyhow!("hash failed"))?;
        sqlx::query(
            "INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4)",
        )
        .bind(s.email)
        .bind(&hash)
        .bind(s.name)
        .bind(&s.role)
        .execute(&state.db)
        .await?;
        tracing::info!("seeded user {}", s.email);
    }
    Ok(())
}
