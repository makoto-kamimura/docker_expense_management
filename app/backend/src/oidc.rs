//! SSO (OpenID Connect) のクライアント。接続先の認証サーバーは設定の発行元 (`OIDC_ISSUER`) だけで決まり、
//! エンドポイントと公開鍵は `/.well-known/openid-configuration` から読む。
//!
//! 流れの全体は handlers/sso.rs を参照。乗っ取りを防ぐ要は 3 つ:
//! - ID トークンは、認証サーバーの公開鍵 (JWKS) で署名を確かめ、`iss`・`aud`・`exp`・`nonce` も確かめる
//! - 利用者の特定には `sub` だけを使う (メールアドレスの一致では入れない)
//! - 認証サーバーから戻ったあとは使い捨ての結果コードを返すだけにし、開始したクライアントが持つ
//!   `code_verifier` (PKCE) を添えて交換したときにはじめてログイン / 連携が成立する

use std::time::{Duration, Instant};

use anyhow::{anyhow, bail, Context};
use base64ct::{Base64UrlUnpadded, Encoding};
use jsonwebtoken::{decode, decode_header, jwk::Jwk, Algorithm, DecodingKey, Validation};
use rand::RngCore;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tokio::sync::RwLock;
use url::Url;

use crate::config::SsoConfig;

/// `user_identities.provider` に入れる値
pub const PROVIDER_SSO: &str = "sso";

/// 設定の公開と公開鍵を読み直す間隔
const CACHE_TTL: Duration = Duration::from_secs(60 * 60);
/// 知らない `kid` のトークンが来たときに、公開鍵を読み直してよい最短の間隔 (鍵の入れ替えに追従しつつ、連打させない)
const JWKS_FORCE_REFRESH_MIN: Duration = Duration::from_secs(10);
/// 時計のずれの許容 (秒)
const LEEWAY_SECONDS: u64 = 60;
/// ID トークンの署名に許す方式。共通鍵 (HS*) と `none` は許さない
const ALLOWED_ALGS: [Algorithm; 8] = [
    Algorithm::RS256,
    Algorithm::RS384,
    Algorithm::RS512,
    Algorithm::PS256,
    Algorithm::PS384,
    Algorithm::PS512,
    Algorithm::ES256,
    Algorithm::EdDSA,
];

// ---------------------------------------------------------------------------
// 乱数・PKCE・戻り先 (DB に触れない部品)
// ---------------------------------------------------------------------------

/// 推測できない 32 バイトの乱数 (base64url、43 文字)
pub fn random_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    Base64UrlUnpadded::encode_string(&bytes)
}

/// DB に保存するためのハッシュ。トークンそのものは保存しない
pub fn hash_token(token: &str) -> String {
    Base64UrlUnpadded::encode_string(&Sha256::digest(token.as_bytes()))
}

/// PKCE (S256) の code_challenge を作る
pub fn pkce_challenge(verifier: &str) -> String {
    Base64UrlUnpadded::encode_string(&Sha256::digest(verifier.as_bytes()))
}

/// RFC 7636 の code_verifier の形 (43〜128 文字の英数字と -._~)
pub fn is_valid_verifier(verifier: &str) -> bool {
    (43..=128).contains(&verifier.len())
        && verifier
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~'))
}

/// S256 の code_challenge の形 (SHA-256 の base64url = 43 文字)
pub fn is_valid_challenge(challenge: &str) -> bool {
    challenge.len() == 43
        && challenge
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
}

pub fn verify_pkce(verifier: &str, challenge: &str) -> bool {
    is_valid_verifier(verifier) && pkce_challenge(verifier) == challenge
}

/// モバイルの戻り先が許可リストの先頭に一致するか。
/// 戻り先が奪われても、結果コードは code_verifier がないと使えない (PKCE) ので、
/// ここは「想定外のアプリやサイトに渡さない」ための絞り込み
pub fn mobile_redirect_allowed(uri: &str, prefixes: &[String]) -> bool {
    let Ok(parsed) = Url::parse(uri) else {
        return false;
    };
    // http(s) は許さない (Web の戻り先はサーバー側で固定)
    if matches!(parsed.scheme(), "http" | "https") || parsed.fragment().is_some() {
        return false;
    }
    prefixes.iter().any(|p| !p.is_empty() && uri.starts_with(p.as_str()))
}

/// 戻り先の URL にクエリを 1 つ足す
pub fn with_query(base: &str, key: &str, value: &str) -> anyhow::Result<String> {
    let mut url = Url::parse(base).with_context(|| format!("invalid return url: {base}"))?;
    url.query_pairs_mut().append_pair(key, value);
    Ok(url.into())
}

/// このメールアドレスの利用者に連携させないか (誰でも入れるデモ用アカウント)
pub fn link_denied(email: &str, deny_domains: &[String]) -> bool {
    let email = email.trim().to_lowercase();
    let Some((_, domain)) = email.rsplit_once('@') else {
        return true;
    };
    deny_domains.iter().any(|d| domain == d)
}

/// 末尾の `/` だけが違う発行元は同じとみなす (設定の書き方の揺れ)
fn same_issuer(a: &str, b: &str) -> bool {
    a.trim_end_matches('/') == b.trim_end_matches('/')
}

// ---------------------------------------------------------------------------
// ID トークンの確認
// ---------------------------------------------------------------------------

/// ID トークンの中身のうち、使うもの
#[derive(Debug, Deserialize)]
pub struct IdClaims {
    pub sub: String,
    pub nonce: Option<String>,
    pub email: Option<String>,
    /// 認証の方法。Rauthy は `pwd` (パスワードだけ) か `mfa` (パスキー)
    #[serde(default)]
    pub amr: Vec<String>,
    /// 複数の `aud` があるときの、トークンを要求したクライアント
    pub azp: Option<String>,
    #[serde(default)]
    pub aud: serde_json::Value,
}

/// ID トークンを受け入れない理由。`MfaRequired` だけは画面で別の案内を出す
#[derive(Debug, PartialEq, Eq)]
pub enum Rejected {
    /// 署名・発行元・宛先・期限・nonce などが合わない
    Invalid(&'static str),
    /// 2 段階認証でログインしていない
    MfaRequired,
}

/// 公開鍵の一覧 (JWKS) を、読めた鍵だけにする (知らない種類の鍵が混じっていても全体を捨てない)
pub fn parse_jwks(value: &serde_json::Value) -> Vec<Jwk> {
    value
        .get("keys")
        .and_then(|k| k.as_array())
        .map(|keys| keys.iter().filter_map(|k| serde_json::from_value::<Jwk>(k.clone()).ok()).collect())
        .unwrap_or_default()
}

/// ID トークンの署名と中身を確かめる。`keys` は認証サーバーの公開鍵
pub fn verify_id_token(
    id_token: &str,
    keys: &[Jwk],
    issuer: &str,
    client_id: &str,
    nonce: &str,
    require_mfa: bool,
) -> Result<IdClaims, Rejected> {
    let header = decode_header(id_token).map_err(|_| Rejected::Invalid("header"))?;
    if !ALLOWED_ALGS.contains(&header.alg) {
        return Err(Rejected::Invalid("alg"));
    }
    let kid = header.kid.as_deref().ok_or(Rejected::Invalid("kid"))?;
    let jwk = keys
        .iter()
        .find(|k| k.common.key_id.as_deref() == Some(kid))
        .ok_or(Rejected::Invalid("unknown_kid"))?;
    // 鍵が方式を指定していれば、トークンの方式と一致すること (RS 鍵で別の方式を名乗らせない)
    if let Some(key_alg) = jwk.common.key_algorithm {
        if format!("{key_alg:?}") != format!("{:?}", header.alg) {
            return Err(Rejected::Invalid("alg_mismatch"));
        }
    }
    let key = DecodingKey::from_jwk(jwk).map_err(|_| Rejected::Invalid("key"))?;

    let mut validation = Validation::new(header.alg);
    validation.set_issuer(&[issuer]);
    validation.set_audience(&[client_id]);
    validation.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
    validation.leeway = LEEWAY_SECONDS;
    let claims = decode::<IdClaims>(id_token, &key, &validation)
        .map_err(|e| match e.kind() {
            jsonwebtoken::errors::ErrorKind::InvalidSignature => Rejected::Invalid("signature"),
            jsonwebtoken::errors::ErrorKind::ExpiredSignature => Rejected::Invalid("exp"),
            jsonwebtoken::errors::ErrorKind::InvalidIssuer => Rejected::Invalid("iss"),
            jsonwebtoken::errors::ErrorKind::InvalidAudience => Rejected::Invalid("aud"),
            _ => Rejected::Invalid("claims"),
        })?
        .claims;

    // 宛先が複数あるときは、要求したのがこのクライアントであること
    if claims.aud.as_array().is_some_and(|a| a.len() > 1) && claims.azp.as_deref() != Some(client_id) {
        return Err(Rejected::Invalid("azp"));
    }
    if claims.nonce.as_deref() != Some(nonce) {
        return Err(Rejected::Invalid("nonce"));
    }
    if claims.sub.is_empty() || claims.sub.len() > 255 {
        return Err(Rejected::Invalid("sub"));
    }
    if require_mfa && !claims.amr.iter().any(|m| m == "mfa") {
        return Err(Rejected::MfaRequired);
    }
    Ok(claims)
}

// ---------------------------------------------------------------------------
// 認証サーバーとの通信
// ---------------------------------------------------------------------------

/// `/.well-known/openid-configuration` のうち、使うもの
#[derive(Clone, Debug, Deserialize)]
pub struct Metadata {
    pub issuer: String,
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    pub jwks_uri: String,
}

#[derive(Default)]
struct Cache {
    metadata: Option<(Metadata, Instant)>,
    jwks: Option<(Vec<Jwk>, Instant)>,
}

/// 認証サーバーのクライアント。設定の公開と公開鍵をキャッシュする (起動時には取りに行かない。
/// 認証サーバーが止まっていても、アプリはパスワードのログインで動く)
pub struct OidcClient {
    pub config: SsoConfig,
    http: reqwest::Client,
    cache: RwLock<Cache>,
}

impl OidcClient {
    pub fn new(config: SsoConfig) -> anyhow::Result<Self> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            // 認証サーバーのエンドポイントはリダイレクトさせない
            .redirect(reqwest::redirect::Policy::none())
            .build()?;
        Ok(Self { config, http, cache: RwLock::new(Cache::default()) })
    }

    async fn get_json(&self, url: &str) -> anyhow::Result<serde_json::Value> {
        let res = self.http.get(url).send().await.with_context(|| format!("GET {url}"))?;
        if !res.status().is_success() {
            bail!("GET {url} returned {}", res.status());
        }
        let text = res.text().await?;
        serde_json::from_str(&text).with_context(|| format!("GET {url}: not JSON"))
    }

    /// 設定の公開を読む。発行元が設定と違えば使わない
    pub async fn metadata(&self) -> anyhow::Result<Metadata> {
        if let Some((m, at)) = &self.cache.read().await.metadata {
            if at.elapsed() < CACHE_TTL {
                return Ok(m.clone());
            }
        }
        let url = format!("{}/.well-known/openid-configuration", self.config.issuer.trim_end_matches('/'));
        let meta: Metadata = serde_json::from_value(self.get_json(&url).await?).context("discovery document")?;
        if !same_issuer(&meta.issuer, &self.config.issuer) {
            bail!("discovery issuer {} does not match OIDC_ISSUER {}", meta.issuer, self.config.issuer);
        }
        // エンドポイントは発行元と同じオリジンだけを使う (設定の公開が書き換えられても外へ秘密を送らない)
        let origin = Url::parse(&meta.issuer)?.origin();
        for endpoint in [&meta.authorization_endpoint, &meta.token_endpoint, &meta.jwks_uri] {
            if Url::parse(endpoint)?.origin() != origin {
                bail!("endpoint {endpoint} is not on the issuer's origin");
            }
        }
        self.cache.write().await.metadata = Some((meta.clone(), Instant::now()));
        Ok(meta)
    }

    async fn jwks(&self, force: bool) -> anyhow::Result<Vec<Jwk>> {
        if let Some((keys, at)) = &self.cache.read().await.jwks {
            let fresh = at.elapsed() < CACHE_TTL;
            let recently = at.elapsed() < JWKS_FORCE_REFRESH_MIN;
            if (fresh && !force) || (force && recently) {
                return Ok(keys.clone());
            }
        }
        let meta = self.metadata().await?;
        let keys = parse_jwks(&self.get_json(&meta.jwks_uri).await?);
        if keys.is_empty() {
            bail!("JWKS has no usable keys");
        }
        self.cache.write().await.jwks = Some((keys.clone(), Instant::now()));
        Ok(keys)
    }

    /// 認可画面の URL
    pub async fn authorization_url(&self, state: &str, nonce: &str, server_challenge: &str) -> anyhow::Result<String> {
        let meta = self.metadata().await?;
        let url = Url::parse_with_params(
            &meta.authorization_endpoint,
            &[
                ("client_id", self.config.client_id.as_str()),
                ("redirect_uri", self.config.callback_url().as_str()),
                ("response_type", "code"),
                ("scope", self.config.scope.as_str()),
                ("state", state),
                ("nonce", nonce),
                ("code_challenge", server_challenge),
                ("code_challenge_method", "S256"),
            ],
        )?;
        Ok(url.into())
    }

    /// 認可コードをトークンエンドポイントで交換し、ID トークンを返す
    pub async fn exchange_code(&self, code: &str, server_verifier: &str) -> anyhow::Result<String> {
        let meta = self.metadata().await?;
        let body = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("grant_type", "authorization_code")
            .append_pair("code", code)
            .append_pair("redirect_uri", &self.config.callback_url())
            .append_pair("client_id", &self.config.client_id)
            .append_pair("client_secret", &self.config.client_secret)
            .append_pair("code_verifier", server_verifier)
            .finish();
        let res = self
            .http
            .post(&meta.token_endpoint)
            .header(reqwest::header::CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body(body)
            .send()
            .await
            .context("token endpoint unreachable")?;
        let status = res.status();
        let text = res.text().await?;
        if !status.is_success() {
            // 応答には秘密は含まれない (error と error_description だけ)
            bail!("token endpoint returned {status}: {}", text.chars().take(200).collect::<String>());
        }
        let parsed: serde_json::Value = serde_json::from_str(&text).context("token response is not JSON")?;
        parsed
            .get("id_token")
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .ok_or_else(|| anyhow!("token response has no id_token"))
    }

    /// ID トークンを確かめる。知らない鍵 (鍵の入れ替え直後) なら、公開鍵を 1 回だけ読み直す
    pub async fn verify(&self, id_token: &str, nonce: &str) -> anyhow::Result<Result<IdClaims, Rejected>> {
        let meta = self.metadata().await?;
        let check = |keys: &[Jwk]| {
            verify_id_token(id_token, keys, &meta.issuer, &self.config.client_id, nonce, self.config.require_mfa)
        };
        let first = check(&self.jwks(false).await?);
        if matches!(first, Err(Rejected::Invalid("unknown_kid"))) {
            return Ok(check(&self.jwks(true).await?));
        }
        Ok(first)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{encode, EncodingKey, Header};

    const ISS: &str = "https://auth.example.test/auth/v1/";
    const CLIENT: &str = "expense";
    // テスト専用の使い捨ての鍵
    const TEST_ED25519_PEM: &str = "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIBvqoW/QP4MBC+L/tYRTbBTMXlNUi15Mil4h95kRvf1M\n-----END PRIVATE KEY-----";
    const TEST_ED25519_X: &str = "rGMjfKjoe6-imhfy38qJ20e5gzzjTEQ2Bi9xMS87r2s";
    const OTHER_ED25519_PEM: &str = "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIGe9Ut1pEsntlXcVByT3VUCA9dxbwBcwUvZspPo57sBq\n-----END PRIVATE KEY-----";

    fn keys() -> Vec<Jwk> {
        parse_jwks(&serde_json::json!({ "keys": [
            { "kty": "OKP", "crv": "Ed25519", "alg": "EdDSA", "use": "sig", "kid": "k1", "x": TEST_ED25519_X },
            // 読めない鍵が混じっていても、ほかの鍵は使える
            { "kty": "XYZ", "kid": "broken" }
        ]}))
    }

    fn now() -> i64 {
        chrono::Utc::now().timestamp()
    }

    fn claims() -> serde_json::Value {
        serde_json::json!({
            "iss": ISS, "aud": CLIENT, "sub": "user-1", "exp": now() + 300, "iat": now(),
            "nonce": "n-1", "email": "me@gmail.com", "amr": ["mfa"]
        })
    }

    fn sign(claims: &serde_json::Value, pem: &str, kid: &str) -> String {
        let mut header = Header::new(Algorithm::EdDSA);
        header.kid = Some(kid.into());
        encode(&header, claims, &EncodingKey::from_ed_pem(pem.as_bytes()).unwrap()).unwrap()
    }

    fn check(token: &str, require_mfa: bool) -> Result<IdClaims, Rejected> {
        verify_id_token(token, &keys(), ISS, CLIENT, "n-1", require_mfa)
    }

    #[test]
    fn jwks_skips_unreadable_keys() {
        assert_eq!(keys().len(), 1);
    }

    #[test]
    fn valid_token_passes() {
        let c = check(&sign(&claims(), TEST_ED25519_PEM, "k1"), true).unwrap();
        assert_eq!(c.sub, "user-1");
        assert_eq!(c.email.as_deref(), Some("me@gmail.com"));
    }

    #[test]
    fn token_signed_by_another_key_is_rejected() {
        assert_eq!(check(&sign(&claims(), OTHER_ED25519_PEM, "k1"), true).err(), Some(Rejected::Invalid("signature")));
    }

    #[test]
    fn unknown_kid_is_reported() {
        assert_eq!(check(&sign(&claims(), TEST_ED25519_PEM, "k2"), true).err(), Some(Rejected::Invalid("unknown_kid")));
    }

    #[test]
    fn symmetric_and_none_algs_are_rejected() {
        let mut header = Header::new(Algorithm::HS256);
        header.kid = Some("k1".into());
        let hs = encode(&header, &claims(), &EncodingKey::from_secret(TEST_ED25519_X.as_bytes())).unwrap();
        assert_eq!(check(&hs, true).err(), Some(Rejected::Invalid("alg")));
        // alg=none (署名なし) は、ヘッダーの時点で読めない
        let none = format!(
            "{}.{}.",
            Base64UrlUnpadded::encode_string(br#"{"alg":"none","kid":"k1"}"#),
            Base64UrlUnpadded::encode_string(claims().to_string().as_bytes())
        );
        assert!(check(&none, true).is_err());
    }

    #[test]
    fn tampered_payload_is_rejected() {
        let token = sign(&claims(), TEST_ED25519_PEM, "k1");
        let mut parts: Vec<&str> = token.split('.').collect();
        let mut forged = claims();
        forged["sub"] = "admin".into();
        let payload = Base64UrlUnpadded::encode_string(forged.to_string().as_bytes());
        parts[1] = &payload;
        assert_eq!(check(&parts.join("."), true).err(), Some(Rejected::Invalid("signature")));
    }

    #[test]
    fn wrong_claims_are_rejected() {
        let cases = [
            ("iss", serde_json::json!("https://evil.example/auth/v1/"), "iss"),
            ("aud", serde_json::json!("other-app"), "aud"),
            ("exp", serde_json::json!(now() - 3600), "exp"),
            ("nonce", serde_json::json!("n-2"), "nonce"),
            ("nonce", serde_json::Value::Null, "nonce"),
            ("sub", serde_json::json!(""), "sub"),
        ];
        for (key, value, expected) in cases {
            let mut c = claims();
            c[key] = value;
            assert_eq!(check(&sign(&c, TEST_ED25519_PEM, "k1"), true).err(), Some(Rejected::Invalid(expected)), "{key}");
        }
    }

    #[test]
    fn multiple_audiences_need_matching_azp() {
        let mut c = claims();
        c["aud"] = serde_json::json!([CLIENT, "other-app"]);
        assert_eq!(check(&sign(&c, TEST_ED25519_PEM, "k1"), true).err(), Some(Rejected::Invalid("azp")));
        c["azp"] = CLIENT.into();
        assert!(check(&sign(&c, TEST_ED25519_PEM, "k1"), true).is_ok());
    }

    #[test]
    fn mfa_is_required_when_configured() {
        let mut c = claims();
        c["amr"] = serde_json::json!(["pwd"]);
        let token = sign(&c, TEST_ED25519_PEM, "k1");
        assert_eq!(check(&token, true).err(), Some(Rejected::MfaRequired));
        assert!(check(&token, false).is_ok());
        c.as_object_mut().unwrap().remove("amr");
        assert_eq!(check(&sign(&c, TEST_ED25519_PEM, "k1"), true).err(), Some(Rejected::MfaRequired));
    }

    #[test]
    fn issuer_trailing_slash_is_tolerated() {
        assert!(same_issuer("https://a.test/auth/v1/", "https://a.test/auth/v1"));
        assert!(!same_issuer("https://a.test/auth/v1/", "https://a.test/auth/v2"));
    }

    #[test]
    fn pkce_rfc7636_example() {
        assert_eq!(
            pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
        let verifier = random_token();
        assert!(verify_pkce(&verifier, &pkce_challenge(&verifier)));
        assert!(!verify_pkce(&random_token(), &pkce_challenge(&verifier)));
        assert!(!is_valid_verifier("short"));
        assert!(!is_valid_challenge("abc"));
    }

    #[test]
    fn mobile_redirects() {
        let p = vec!["expense://".to_string(), "exp://".to_string()];
        assert!(mobile_redirect_allowed("expense://auth/sso", &p));
        assert!(mobile_redirect_allowed("exp://192.168.0.5:8095/--/auth/sso", &p));
        assert!(!mobile_redirect_allowed("https://evil.example/auth", &p));
        assert!(!mobile_redirect_allowed("other://auth/sso", &p));
        assert!(!mobile_redirect_allowed("expense://auth/sso#frag", &p));
        assert!(!mobile_redirect_allowed("not a url", &p));
    }

    #[test]
    fn query_is_appended() {
        assert_eq!(
            with_query("exp://10.0.0.1:8095/--/auth/sso", "code", "a b").unwrap(),
            "exp://10.0.0.1:8095/--/auth/sso?code=a+b"
        );
    }

    #[test]
    fn demo_domains_are_denied() {
        let deny = vec!["example.com".to_string()];
        assert!(link_denied("Dad@EXAMPLE.com ", &deny));
        assert!(!link_denied("me@gmail.com", &deny));
        assert!(link_denied("no-at-mark", &deny));
    }
}
