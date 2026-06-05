use std::path::Path;
use std::process::Stdio;

use axum::{extract::Multipart, Json};
use regex::Regex;
use serde::Serialize;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiError, ApiResult},
};

#[derive(Debug, Serialize)]
pub struct OcrResult {
    /// レシートから推定した金額（円）。抽出できなければ null。
    pub amount_jpy: Option<i64>,
    /// 推定した発生日 (YYYY-MM-DD)。抽出できなければ null。
    pub incurred_on: Option<String>,
    /// 認識した生テキスト（確認・デバッグ用）。
    pub raw_text: String,
}

/// レシート画像を受け取り Tesseract で OCR し、金額・日付を推定して返す。
/// 認証ユーザーのみ利用可能。画像はその場で処理し保存しない。
pub async fn scan(AuthUser(_claims): AuthUser, mut multipart: Multipart) -> ApiResult<Json<OcrResult>> {
    let field = multipart
        .next_field()
        .await?
        .ok_or_else(|| ApiError::BadRequest("file field missing".into()))?;
    let bytes = field.bytes().await?;
    if bytes.is_empty() {
        return Err(ApiError::BadRequest("empty file".into()));
    }
    if bytes.len() > 10 * 1024 * 1024 {
        return Err(ApiError::BadRequest("file too large (max 10MB)".into()));
    }

    // Tesseract CLI はファイルパスを取るので一時ファイルへ書き出す
    let tmp = std::env::temp_dir().join(format!("ocr-{}", Uuid::new_v4()));
    {
        let mut f = tokio::fs::File::create(&tmp).await?;
        f.write_all(&bytes).await?;
        f.flush().await?;
    }
    let text_result = run_tesseract(&tmp).await;
    tokio::fs::remove_file(&tmp).await.ok();
    let text = text_result?;

    Ok(Json(OcrResult {
        amount_jpy: parse_amount(&text),
        incurred_on: parse_date(&text),
        raw_text: text,
    }))
}

async fn run_tesseract(path: &Path) -> ApiResult<String> {
    let output = Command::new("tesseract")
        .arg(path)
        .arg("stdout")
        .args(["-l", "jpn+eng"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("failed to run tesseract: {e}")))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(ApiError::Internal(anyhow::anyhow!("tesseract failed: {err}")));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// 金額の推定。
/// 1) ¥1,234 / 1,234円 のような通貨表記を最優先で抽出し、その最大値を採用。
/// 2) 無ければ「合計/総計/お会計/total」を含む行のカンマ区切り数値の最大値。
fn parse_amount(text: &str) -> Option<i64> {
    let marked = Regex::new(r"(?:[¥￥]\s*([0-9][0-9,]{1,9})|([0-9][0-9,]{1,9})\s*円)").unwrap();
    let marked_max = marked
        .captures_iter(text)
        .filter_map(|c| c.get(1).or_else(|| c.get(2)))
        .filter_map(|m| m.as_str().replace(',', "").parse::<i64>().ok())
        .max();
    if let Some(v) = marked_max {
        return Some(v);
    }

    let keyword = Regex::new(r"(?i)合\s*計|総\s*計|お会計|お買上|total").unwrap();
    let grouped = Regex::new(r"([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,7})").unwrap();
    for line in text.lines() {
        if keyword.is_match(line) {
            if let Some(v) = grouped
                .captures_iter(line)
                .filter_map(|c| c.get(1))
                .filter_map(|m| m.as_str().replace(',', "").parse::<i64>().ok())
                .max()
            {
                return Some(v);
            }
        }
    }
    None
}

/// 日付の推定。YYYY年MM月DD日 / YYYY/MM/DD / YYYY-MM-DD / YYYY.MM.DD を許容。
fn parse_date(text: &str) -> Option<String> {
    let re = Regex::new(r"(20[0-9]{2})\s*[年./\-]\s*([0-1]?[0-9])\s*[月./\-]\s*([0-3]?[0-9])").unwrap();
    let c = re.captures(text)?;
    let y: i32 = c[1].parse().ok()?;
    let m: u32 = c[2].parse().ok()?;
    let d: u32 = c[3].parse().ok()?;
    if (1..=12).contains(&m) && (1..=31).contains(&d) {
        Some(format!("{y:04}-{m:02}-{d:02}"))
    } else {
        None
    }
}
