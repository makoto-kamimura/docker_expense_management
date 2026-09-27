# RingiWoMerge — 稟議をマージ

> **Big purchases deserve a review.** 大きな買い物は、家族のレビューを通してから。

家庭内で高額な商品・サービスを買うときに、購入したい人が理由・価格・商品リンク・比較・資料をまとめて申請し、
家族が確認・質問・承認できるアプリ。GitHub の Pull Request の流れを、GitHub を知らない人にもわかる言葉で家庭の購入判断に使う。

```
Request → Review → Comment → Approve → Merge → Purchase
```

仕様は [memo.md](memo.md) を参照（§29 の MVP に加え、ラベル・家事のコミットなどを実装）。

## 機能

| 機能 | 内容 |
|------|------|
| Family | 家族を作成（作成者が Admin）/ 招待コードで参加。データは家族ごとに分離 |
| Roles | Requester（申請できる）/ Reviewer（レビューできる）/ Admin（家族設定）。1 人が兼任可。権限の変更は即時反映 |
| 稟議の種類 | 🛍 買いたいもの / 📍 行きたいところ / ✨ やりたいこと。流れは共通で、項目名と完了の表現（購入済み / 行ってきた / やった）が変わる |
| 分岐 | 既存の稟議から「その後でやりたいこと」などを派生させる（Git のブランチ風）。分岐元と分岐先を相互リンクし、分岐先を申請すると分岐元のアクティビティにも記録 |
| Purchase Request | Title / Price（保存に必須）、Seller / Product / Product Link / Purchase Date / Labels / Alternative Products / Notes / Attachments。下書きは途中でも保存でき、レビューの依頼時に種類ごとの必須項目（買いたいもの: 購入先・理由、行きたいところ: 行き先・理由、やりたいこと: 理由）とレビュアー 1 人以上をそろえる |
| Workflow | Draft → Submitted → Under Review ⇄ Changes Needed → Approved → **Merged** → Purchased（却下・取り下げは Closed） |
| Review | Comment / Request Changes（コメント必須）/ Approve（確認ダイアログ）/ Reject。Reviewer が開くと Under Review に進む |
| Merge | 承認後に Requester か Reviewer が Merge =「家族が購入に合意した」 |
| Purchase | Mark as Purchased：実額・購入日・注文番号・最終 URL・レシート（モバイルは撮影 + OCR で自動入力） |
| ラベル | 家族ごとに色付きのラベル（家・生活・趣味・旅行などの分類や、急ぎ・誕生日・記念日・セール待ちなど）を作り、稟議に複数付けられる。付け外しは申請者とレビュアー、ラベル自体の管理は Admin。Web の一覧でラベルを押すと絞り込み。以前のカテゴリはラベルに移行済み（「その他」はラベルなし） |
| Activity | 作成・申請・レビュー・修正・承認・Merge・購入・添付などの操作とコメントを時系列で表示 |
| リンクプレビュー | 商品URL・行き先のURL・比較商品のURLから OGP / JSON-LD の画像とタイトルを自動取得し、一覧のサムネイル・詳細のリンクカード・比較表・まとめ資料に表示（取得は保存時にバックグラウンドで実行。SSRF 対策あり） |
| 変更履歴 | 詳細の「履歴」タブ。操作を日付ごとに並べ、編集は項目ごとに変更前 → 変更後を差分表示 |
| 再オープン | クローズ（却下・取り下げ）した稟議を申請者かレビュアーがレビュー待ちに戻す。判定はリセット |
| 家事のコミット | マイページで掃除・洗濯などの家事を「コミット」ボタンで記録（1 つの家事は 1 日 1 回、プッシュするまではその日のうちなら取り消し可）。GitHub 風の草グラフ、🔥連続日数、マーク（はじめて / 3・7・30 日連続 / 累計 10・50・100 日）を表示。「すべて / 毎日 / 週 / 月」のタブごとに、その家事（非表示を除く）をすべてクリアすると「プッシュ」でき、種類ごとのトロフィー（🏆 すべて・🥉 毎日・🥈 週・🥇 月）が取り消せない実績として残る（週 / 月は今週 / 今月に推奨の回数ぶんコミットでクリア）。「今日の家事」は推奨頻度（すべて / 毎日 / 週 / 月）で切り替えられ、表示中の家事の合計所要時間（1 回ずつの合計と、回数込みの期間あたり）を表示。モバイルは 1 行 1 家事の一覧で「まだ / 済み / すべて」の絞り込み付き |
| 家事の項目 | 管理者が Web の設定画面で追加・名前変更・説明・所要時間・推奨頻度（毎日 / 週 N 回 / 月 N 回など）の記入・並び替え・非表示にできる（アイコンを空欄にすると名前から選ぶ）。家族を作ると掃除・洗濯・料理などの初期セットが入る。家事ごとに「きれいな状態の見本」の画像を 10 枚まで（JPG・PNG・WEBP、各 10MB）、画像ごとの説明付きで登録できる |
| レビューでの考慮 | 稟議の詳細に申請者の家事の実績（草グラフ・トロフィー・連続日数・マーク）を表示し、レビューのチェックポイントにも反映。申請時点の実績をアクティビティに記録 |
| Summary | 申請内容のスライド表示（家族会議用）。Web は全画面の投影モードと持ち時間タイマー付き、印刷で A4 横 PDF |
| Dashboard | 件数・レビュー待ち・購入済み・支出合計・ラベル別支出（複数ラベルはそれぞれに計上）、自分の家事の実績（今日の状況・トロフィー・連続日数・累計・草グラフ・マーク・家事ごとの日数） |
| Onboarding | 初回ログイン時に 3 ステップの説明 |

UI は日本語表示で、見た目・配色は GitHub (Primer) の Pull Request 画面に寄せている（Open = 緑 / Draft = 灰 / Merged = 紫 / Closed = 赤）。
用語は memo.md §34 の概念を日本語にしたもの（稟議・レビュー・承認・修正依頼・マージ・購入済み…）。

## 技術スタック

| 役割 | 技術 |
|------|------|
| Web | Next.js 14 (App Router) + TypeScript |
| Mobile | Expo (Expo Router) + TypeScript |
| API | Rust (axum + sqlx) |
| DB | PostgreSQL 16 |
| Auth | JWT + Argon2id |
| Reverse Proxy | Nginx |
| Infra | Docker / Docker Compose |
| Storage | API ローカル volume |

## ディレクトリ構成

```
.
├── app/
│   ├── backend/              # Rust API
│   │   └── src/
│   │       ├── migrate.rs    # スキーマ (冪等) と旧・経費精算 DB からの移行
│   │       ├── seed.rs       # デモ家族・サンプル申請・家事のコミット
│   │       ├── previews.rs   # リンクプレビューの取得 (SSRF 対策)
│   │       └── handlers/     # auth / family / requests / labels / attachments / chores / dashboard / link_previews / ocr / health
│   ├── web/                  # Next.js Web
│   └── mobile/               # Expo モバイルアプリ
├── platform/                 # Docker / Nginx 設定 (db/init.sql は拡張の有効化のみ)
├── doc/                      # 技術要件・タスク・変更履歴・運用手順
├── memo.md                   # プロダクト仕様
└── README.md
```

## クイックスタート

```bash
cd platform
cp .env.example .env
docker compose up --build -d
```

| URL | 説明 |
|-----|------|
| <http://localhost:3100> | Nginx 経由 (本番想定の入口) |
| <http://localhost:3000> | Web 直接 (開発用) |
| <http://localhost:8082> | API 直接 (開発用。コンテナ内は 8080) |

いずれも 127.0.0.1 にだけ公開している（同じサーバーの他のサービスとポートが重ならないように、[platform/docker-compose.yml](platform/docker-compose.yml) で割り当て）。

詳しい運用手順は [doc/operation.md](doc/operation.md) を参照。

## デモアカウント

パスワードはすべて `password123`。API 起動時に投入され、デモ家族には状態の違うサンプル稟議と、直近 6 週間ぶんの家事のコミットも入る。
（以前の英語版のデモデータが残っている環境では、初期値のままの行だけを日本語に置き換える。利用者が作成・編集したデータは変えない）
**本番投入前に必ず変更/無効化してください。**

| 家族 | 名前 | メール | 権限 |
|------|------|--------|------|
| デモ家族 | パパ | dad@example.com | 申請者 / レビュアー / 管理者 |
| デモ家族 | ママ | mom@example.com | 申請者 / レビュアー |
| デモ家族 | 子ども | child@example.com | 申請者 |
| 別の家族 | おとなりさん | other@example.com | すべて（家族ごとの分離の確認用） |

## 旧・経費精算アプリからの移行

API 起動時に `app/backend/src/migrate.rs` が旧スキーマ（`expenses` など）を検出すると、一度だけ次を行う。

- 組織（テナント）→ Family、ユーザーのロール → 権限（employee = Requester、approver = +Reviewer、admin = すべて）
- 経費申請 → 購入申請（承認済み = Approved、却下 = Closed）、領収書 → Attachments、判定メモ → コメント
- 旧テーブルは削除せず `legacy_*` にリネームして残す

## モバイルアプリ

```bash
cd app/mobile
npm install
npm run start
```

API の接続先は、環境変数 `EXPO_PUBLIC_API_BASE_URL` → Metro のホストの 8080 番 → `app/mobile/app.json` の `expo.extra.apiUrl` の順に決まる（詳しくは [app/mobile/README.md](app/mobile/README.md)）。
公開デモ（Expo Go）は `https://expense.makoto-kamimura.com/api` を指定して起動している。ローカルの Docker Compose は API を 127.0.0.1:8082 にしか公開していないので、実機から使うときは `EXPO_PUBLIC_API_BASE_URL` で到達できる URL を指定する。
家族の作成・メンバー管理・ラベルと家事の項目の管理は Web の設定画面から行う。

## ドキュメント

- [memo.md](memo.md) — プロダクト仕様
- [doc/design.md](doc/design.md) — 技術要件
- [doc/task.md](doc/task.md) — タスク管理
- [doc/history.md](doc/history.md) — 変更履歴
- [doc/operation.md](doc/operation.md) — 運用手順書
