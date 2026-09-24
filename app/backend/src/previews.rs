//! リンク先ページのプレビュー (OGP / JSON-LD の画像とタイトル) を取得してキャッシュする。
//!
//! 利用者が入力した URL をサーバーから取得するので、SSRF 対策として
//! - http / https・標準ポートのみ
//! - 接続先 IP がグローバルアドレスであることを確認し、その IP に固定して接続 (DNS リバインディング対策)
//! - リダイレクトは自前で辿り、毎回同じ検査をする
//! - サイズ・時間に上限を設け、画像は中身 (マジックナンバー) で種類を判定する
//! を行う。

use std::{
    collections::HashSet,
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    path::PathBuf,
    sync::{Mutex, OnceLock},
    time::Duration,
};

use anyhow::{anyhow, bail, Context};
use reqwest::{header, redirect::Policy, Url};
use scraper::{Html, Selector};
use serde_json::Value;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

use crate::state::AppState;

const USER_AGENT: &str = "Mozilla/5.0 (compatible; RingiWoMergeBot/1.0; link preview)";
const MAX_HTML_BYTES: usize = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;
const MAX_REDIRECTS: usize = 5;
const TIMEOUT: Duration = Duration::from_secs(8);

/// 取得中の URL (同じ URL を同時に取りに行かないため)
fn in_flight() -> &'static Mutex<HashSet<String>> {
    static SET: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SET.get_or_init(|| Mutex::new(HashSet::new()))
}

/// URL のプレビューを必要なら取得する。呼び出し元は待たない (バックグラウンドで実行)。
/// 取得済み、または 1 日以内に失敗した URL はスキップする。
pub fn ensure(state: &AppState, urls: impl IntoIterator<Item = String>) {
    let mut urls: Vec<String> = urls.into_iter().filter(|u| !u.trim().is_empty()).collect();
    urls.sort();
    urls.dedup();
    if urls.is_empty() {
        return;
    }
    let state = state.clone();
    tokio::spawn(async move {
        for url in urls {
            if let Err(e) = ensure_one(&state, &url).await {
                tracing::warn!("link preview error for {url}: {e:#}");
            }
        }
    });
}

/// 起動時に、既存の稟議で使われている URL のプレビューをまとめて取得する
pub async fn backfill(state: &AppState) -> anyhow::Result<()> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT url FROM (
            SELECT product_url AS url FROM purchase_requests
            UNION SELECT final_product_url FROM purchase_requests
            UNION SELECT url FROM alternative_products
         ) u WHERE url IS NOT NULL",
    )
    .fetch_all(&state.db)
    .await?;
    ensure(state, rows.into_iter().map(|r| r.0));
    Ok(())
}

async fn ensure_one(state: &AppState, url: &str) -> anyhow::Result<()> {
    let (skip,): (bool,) = sqlx::query_as(
        "SELECT EXISTS (SELECT 1 FROM link_previews WHERE url = $1
                         AND (status = 'ok' OR fetched_at > now() - interval '1 day'))",
    )
    .bind(url)
    .fetch_one(&state.db)
    .await?;
    if skip {
        return Ok(());
    }
    if !in_flight().lock().unwrap().insert(url.to_string()) {
        return Ok(());
    }
    let result = fetch_and_store(state, url).await;
    in_flight().lock().unwrap().remove(url);

    match result {
        Ok(()) => Ok(()),
        Err(e) => {
            sqlx::query(
                "INSERT INTO link_previews (url, status, error, fetched_at) VALUES ($1, 'failed', $2, now())
                 ON CONFLICT (url) DO UPDATE SET status = 'failed', error = EXCLUDED.error, fetched_at = now()",
            )
            .bind(url)
            .bind(format!("{e:#}"))
            .execute(&state.db)
            .await?;
            Err(e)
        }
    }
}

async fn fetch_and_store(state: &AppState, url: &str) -> anyhow::Result<()> {
    let page_url = Url::parse(url).context("invalid url")?;
    let page = safe_get(page_url, MAX_HTML_BYTES).await?;
    let html = decode_html(&page.bytes, page.content_type.as_deref());
    let meta = parse_meta(&html, &page.url);

    // 画像は取れなくてもタイトルだけは残す
    let mut image: Option<(String, &'static str)> = None;
    for candidate in &meta.images {
        match fetch_image(candidate.clone()).await {
            Ok((bytes, mime)) => {
                let key = format!("previews/{}", Uuid::new_v4());
                let path = PathBuf::from(&state.config.upload_dir).join(&key);
                if let Some(parent) = path.parent() {
                    tokio::fs::create_dir_all(parent).await?;
                }
                let mut f = tokio::fs::File::create(&path).await?;
                f.write_all(&bytes).await?;
                f.flush().await?;
                image = Some((key, mime));
                break;
            }
            Err(e) => tracing::debug!("preview image {candidate} skipped: {e:#}"),
        }
    }
    if meta.title.is_none() && image.is_none() {
        bail!("no title or image found");
    }

    let old_key: Option<(Option<String>,)> =
        sqlx::query_as("SELECT image_key FROM link_previews WHERE url = $1")
            .bind(url)
            .fetch_optional(&state.db)
            .await?;
    sqlx::query(
        "INSERT INTO link_previews (url, status, title, site_name, image_key, image_type, error, fetched_at)
         VALUES ($1, 'ok', $2, $3, $4, $5, NULL, now())
         ON CONFLICT (url) DO UPDATE SET status = 'ok', title = EXCLUDED.title, site_name = EXCLUDED.site_name,
             image_key = EXCLUDED.image_key, image_type = EXCLUDED.image_type, error = NULL, fetched_at = now()",
    )
    .bind(url)
    .bind(&meta.title)
    .bind(&meta.site_name)
    .bind(image.as_ref().map(|i| &i.0))
    .bind(image.as_ref().map(|i| i.1))
    .execute(&state.db)
    .await?;
    // 取り直した場合は古い画像を消す
    if let Some((Some(old),)) = old_key {
        tokio::fs::remove_file(PathBuf::from(&state.config.upload_dir).join(old)).await.ok();
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// 安全な HTTP 取得
// ---------------------------------------------------------------------------

struct Fetched {
    url: Url,
    content_type: Option<String>,
    bytes: Vec<u8>,
}

/// グローバルに到達できるアドレスか (プライベート・ループバック・リンクローカル等を除外)
fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_public_v4(v4),
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_public_v4(v4);
            }
            let seg = v6.segments();
            !(v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || (seg[0] & 0xfe00) == 0xfc00 // unique local
                || (seg[0] & 0xffc0) == 0xfe80 // link local
                || (seg[0] == 0x2001 && seg[1] == 0x0db8) // documentation
                || v6 == Ipv6Addr::new(0, 0, 0, 0, 0, 0xffff, 0, 0))
        }
    }
}

fn is_public_v4(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    !(ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_documentation()
        || ip.is_unspecified()
        || ip.is_multicast()
        || o[0] == 0
        || (o[0] == 100 && (o[1] & 0xc0) == 64) // CGNAT 100.64.0.0/10
        || (o[0] == 192 && o[1] == 0 && o[2] == 0) // 192.0.0.0/24
        || (o[0] == 198 && (o[1] & 0xfe) == 18) // 198.18.0.0/15
        || o[0] >= 240)
}

/// URL を検査し、接続してよいアドレスを 1 つ返す
async fn resolve_public(url: &Url) -> anyhow::Result<SocketAddr> {
    if !matches!(url.scheme(), "http" | "https") {
        bail!("scheme not allowed");
    }
    let port = url.port_or_known_default().ok_or_else(|| anyhow!("no port"))?;
    if url.port().is_some() && !matches!(port, 80 | 443) {
        bail!("port not allowed");
    }
    if !url.username().is_empty() || url.password().is_some() {
        bail!("credentials in url not allowed");
    }
    let addrs: Vec<SocketAddr> = match url.host().ok_or_else(|| anyhow!("no host"))? {
        // IP アドレスを直接書いた URL は名前解決せずにそのまま検査する
        url::Host::Ipv4(ip) => vec![SocketAddr::new(IpAddr::V4(ip), port)],
        url::Host::Ipv6(ip) => vec![SocketAddr::new(IpAddr::V6(ip), port)],
        url::Host::Domain(host) => tokio::time::timeout(TIMEOUT, tokio::net::lookup_host((host, port)))
            .await
            .context("dns timeout")??
            .collect(),
    };
    if addrs.is_empty() {
        bail!("host not found");
    }
    // 1 つでも内部アドレスに解決されるホストは拒否する
    if addrs.iter().any(|a| !is_public_ip(a.ip())) {
        bail!("non-public address");
    }
    Ok(addrs[0])
}

async fn safe_get(mut url: Url, max_bytes: usize) -> anyhow::Result<Fetched> {
    for _ in 0..=MAX_REDIRECTS {
        let addr = resolve_public(&url).await?;
        let host = url.host_str().unwrap_or_default().to_string();
        let client = reqwest::Client::builder()
            .redirect(Policy::none())
            .timeout(TIMEOUT)
            .user_agent(USER_AGENT)
            // 検査済みの IP に固定して接続する
            .resolve(&host, addr)
            .build()?;
        let mut resp = client
            .get(url.clone())
            .header(header::ACCEPT, "text/html,application/xhtml+xml,image/*;q=0.9,*/*;q=0.5")
            .header(header::ACCEPT_LANGUAGE, "ja,en;q=0.8")
            .send()
            .await?;
        if resp.status().is_redirection() {
            let loc = resp
                .headers()
                .get(header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| anyhow!("redirect without location"))?;
            url = url.join(loc)?;
            continue;
        }
        if !resp.status().is_success() {
            bail!("http status {}", resp.status());
        }
        if resp.content_length().is_some_and(|n| n as usize > max_bytes) {
            bail!("too large");
        }
        let content_type = resp
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(str::to_string);
        let mut bytes = Vec::new();
        while let Some(chunk) = resp.chunk().await? {
            bytes.extend_from_slice(&chunk);
            if bytes.len() > max_bytes {
                bail!("too large");
            }
        }
        return Ok(Fetched { url, content_type, bytes });
    }
    bail!("too many redirects")
}

/// 画像を取得し、中身から種類を判定する (SVG など画像以外は拒否)
async fn fetch_image(url: Url) -> anyhow::Result<(Vec<u8>, &'static str)> {
    let got = safe_get(url, MAX_IMAGE_BYTES).await?;
    let b = &got.bytes;
    let mime = if b.starts_with(&[0xff, 0xd8, 0xff]) {
        "image/jpeg"
    } else if b.starts_with(b"\x89PNG\r\n\x1a\n") {
        "image/png"
    } else if b.starts_with(b"GIF87a") || b.starts_with(b"GIF89a") {
        "image/gif"
    } else if b.len() > 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        "image/webp"
    } else if b.len() > 12 && &b[4..8] == b"ftyp" && (&b[8..12] == b"avif" || &b[8..12] == b"avis") {
        "image/avif"
    } else {
        bail!("not a supported image");
    };
    Ok((got.bytes, mime))
}

// ---------------------------------------------------------------------------
// HTML の解析
// ---------------------------------------------------------------------------

/// Content-Type か <meta charset> の文字コードで HTML を文字列にする (Shift_JIS などに対応)
fn decode_html(bytes: &[u8], content_type: Option<&str>) -> String {
    let from_header = content_type
        .and_then(|ct| ct.split(';').find_map(|p| p.trim().strip_prefix("charset=")))
        .map(|c| c.trim_matches('"').to_string());
    let from_meta = || {
        let head = String::from_utf8_lossy(&bytes[..bytes.len().min(4096)]).to_ascii_lowercase();
        let re = regex::Regex::new(r#"charset\s*=\s*["']?([a-z0-9_\-]+)"#).ok()?;
        re.captures(&head).map(|c| c[1].to_string())
    };
    let label = from_header.or_else(from_meta).unwrap_or_else(|| "utf-8".into());
    let enc = encoding_rs::Encoding::for_label(label.as_bytes()).unwrap_or(encoding_rs::UTF_8);
    enc.decode(bytes).0.into_owned()
}

#[derive(Debug, Default)]
struct Meta {
    title: Option<String>,
    site_name: Option<String>,
    /// 優先度の高い順の画像候補
    images: Vec<Url>,
}

fn parse_meta(html: &str, base: &Url) -> Meta {
    let doc = Html::parse_document(html);
    let meta = |sel: &str| -> Option<String> {
        let s = Selector::parse(sel).ok()?;
        doc.select(&s)
            .filter_map(|e| e.value().attr("content"))
            .map(|v| v.trim().to_string())
            .find(|v| !v.is_empty())
    };
    let clean = |s: String| -> Option<String> {
        let s: String = s.split_whitespace().collect::<Vec<_>>().join(" ");
        (!s.is_empty()).then(|| s.chars().take(300).collect())
    };

    // JSON-LD の商品情報 (ECサイトが検索エンジン向けに載せている)
    let mut ld_name = None;
    let mut ld_images = Vec::new();
    if let Ok(s) = Selector::parse(r#"script[type="application/ld+json"]"#) {
        for script in doc.select(&s) {
            if let Ok(v) = serde_json::from_str::<Value>(&script.inner_html()) {
                collect_ld_product(&v, &mut ld_name, &mut ld_images, 0);
            }
        }
    }

    let title_tag = Selector::parse("title")
        .ok()
        .and_then(|s| doc.select(&s).next().map(|e| e.text().collect::<String>()));
    let title = meta(r#"meta[property="og:title"]"#)
        .or_else(|| meta(r#"meta[name="twitter:title"]"#))
        .or(ld_name)
        .or(title_tag)
        .and_then(clean);
    let site_name = meta(r#"meta[property="og:site_name"]"#).and_then(clean);

    let mut images = Vec::new();
    let mut push = |raw: Option<String>| {
        if let Some(u) = raw.and_then(|r| base.join(r.trim()).ok()) {
            if matches!(u.scheme(), "http" | "https") && !images.contains(&u) {
                images.push(u);
            }
        }
    };
    push(meta(r#"meta[property="og:image:secure_url"]"#));
    push(meta(r#"meta[property="og:image"]"#));
    for img in ld_images {
        push(Some(img));
    }
    push(meta(r#"meta[name="twitter:image"]"#));
    push(meta(r#"meta[name="twitter:image:src"]"#));
    images.truncate(4);

    Meta { title, site_name, images }
}

/// JSON-LD から @type が Product の name / image を探す (@graph や配列も辿る)
fn collect_ld_product(v: &Value, name: &mut Option<String>, images: &mut Vec<String>, depth: usize) {
    if depth > 6 {
        return;
    }
    match v {
        Value::Array(items) => items.iter().for_each(|i| collect_ld_product(i, name, images, depth + 1)),
        Value::Object(map) => {
            let is_product = match map.get("@type") {
                Some(Value::String(t)) => t == "Product",
                Some(Value::Array(ts)) => ts.iter().any(|t| t == "Product"),
                _ => false,
            };
            if is_product {
                if name.is_none() {
                    *name = map.get("name").and_then(Value::as_str).map(str::to_string);
                }
                match map.get("image") {
                    Some(Value::String(s)) => images.push(s.clone()),
                    Some(Value::Array(a)) => images.extend(a.iter().filter_map(|i| match i {
                        Value::String(s) => Some(s.clone()),
                        Value::Object(o) => o.get("url").and_then(Value::as_str).map(str::to_string),
                        _ => None,
                    })),
                    Some(Value::Object(o)) => {
                        if let Some(u) = o.get("url").and_then(Value::as_str) {
                            images.push(u.to_string());
                        }
                    }
                    _ => {}
                }
            }
            if let Some(g) = map.get("@graph") {
                collect_ld_product(g, name, images, depth + 1);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_internal_addresses() {
        for ip in ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1"] {
            assert!(!is_public_ip(ip.parse().unwrap()), "{ip} must be rejected");
        }
        for ip in ["8.8.8.8", "133.242.0.1", "2606:4700:4700::1111"] {
            assert!(is_public_ip(ip.parse().unwrap()), "{ip} must be allowed");
        }
    }

    #[test]
    fn parses_og_and_json_ld() {
        let html = r#"<html><head><title>fallback</title>
            <meta property="og:title" content=" カメラ  α6400 ">
            <meta property="og:site_name" content="Shop">
            <meta property="og:image" content="/img/a.jpg">
            <script type="application/ld+json">{"@graph":[{"@type":"Product","name":"x","image":["https://cdn.example.com/b.jpg"]}]}</script>
            </head></html>"#;
        let m = parse_meta(html, &Url::parse("https://shop.example.com/item/1").unwrap());
        assert_eq!(m.title.as_deref(), Some("カメラ α6400"));
        assert_eq!(m.site_name.as_deref(), Some("Shop"));
        assert_eq!(m.images[0].as_str(), "https://shop.example.com/img/a.jpg");
        assert_eq!(m.images[1].as_str(), "https://cdn.example.com/b.jpg");
    }

    #[test]
    fn decodes_shift_jis_from_meta() {
        let (sjis, _, _) = encoding_rs::SHIFT_JIS.encode("<meta charset=\"Shift_JIS\"><title>日本語</title>");
        assert!(decode_html(&sjis, Some("text/html")).contains("日本語"));
    }
}
