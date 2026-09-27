# 変更履歴

リリースおよび主要な実装変更を時系列で記録する。フォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に準拠する。

## [Unreleased]

### Added — 毎日 / 週 / 月 / すべて ごとのプッシュとトロフィー
- 「今日の家事」のタブ (すべて / 毎日 / 週 / 月) ごとに、そのタブの家事 (非表示を除く) をすべてクリアするとプッシュでき、種類ごとのトロフィーが取れる: すべて 🏆「すべてクリア」(今日すべての家事を今日)、毎日 🥉「毎日クリア」(頻度が毎日の家事を今日)、週 🥈「週クリア」(頻度が週の家事を今週、日曜始まり)、月 🥇「月クリア」(頻度が月の家事を今月)。週 / 月は推奨の回数 (1 日 1 回までなので期間の日数が上限) の日数コミットするとクリア。プッシュはすべて / 毎日が 1 日 1 回、週が 1 週 1 回、月が 1 か月 1 回。
- `chore_pushes` に `scope` (all / day / week / month) と `period_start` (期間の初日) を追加し、一意制約を `(user_id, scope, period_start)` に変更。既存の記録は `scope = 'all'` として起動時に移行する。
- `POST /chores/push` が本文 `{"scope": "day" | "week" | "month" | "all"}` を受け取る (省略時は all なので以前のアプリもそのまま動く)。`GET /chores` に種類ごとの状況 `pushes` (対象の件数・クリアした件数・プッシュできるか・プッシュ済みか)、家事ごとに今の期間の `period_done` / `period_target` と取り消せないかどうか `locked`、実績に種類ごとの数 `trophy_counts` を追加。`trophies` は全種類の合計。
- プッシュすると、その種類の対象の家事の今日のコミットは取り消せなくなる (すべてを今日プッシュしたら全部、週をプッシュしたら週の家事)。
- Web / Mobile: タブにプッシュ済みのトロフィーを表示し、表示中のタブのクリア状況・プッシュボタン・獲得済みの表示を出す。週 / 月の家事のカードに「今週 1/2回」などの進み具合。実績のトロフィー数に種類ごとの内訳。

### Added — 今日の家事を推奨頻度で切り替え・合計所要時間
- マイページの「今日の家事」に「すべて / 毎日 / 週 / 月」のタブ (件数付き)。推奨頻度の期間が一致する家事だけを表示し、頻度が未設定の家事は「すべて」にだけ出る。Web は `/chores?period=day|week|month`、Mobile はタブで切り替え (「まだ / 済み / すべて」の絞り込みと併用)。
- 表示中の家事の所要時間の合計を表示: 1 回ずつやった場合の合計と、回数を掛けたその期間あたりの合計 (例: 「合計 ⏱ 1時間20分 · 1日あたり 2時間5分」)。所要時間が未設定の家事は合計に含めず、件数を添える。

### Changed — モバイルのマイページを見つけやすく
- 家事を 2 列の大きなカードから 1 行 1 家事の一覧に変更。行の右に小さなコミットボタン (コミット済みは「✓ 済み」、取り消しは確認付き)、左に見本画像 / アイコンと、所要時間・頻度・連続日数・累計を 1 行で表示。
- 進み具合 (N / M コミット済み) のバーと、「まだ / 済み / すべて」の絞り込み (最初は「まだ」)、家事が 7 件以上なら名前で探す欄を追加。

### Fixed — モバイルでログインできない
- 公開デモでは API が 8080 番を公開していないのに、アプリが `http://<Metro のホスト>:8080` に接続していた。`EXPO_PUBLIC_API_BASE_URL` を最優先の接続先にし、`platform/scripts/expo-demo.sh` で expense に `https://expense.makoto-kamimura.com/api` を指定。

### Added — ラベル (GitHub の Labels)
- 家族ごとのラベル (`labels`: 名前・色 #rrggbb・説明。名前は家族内で大文字小文字を区別せず一意) と、稟議へのラベル付け (`request_labels`、複数可)。初期ラベル (急ぎ・誕生日・記念日・セール待ち・相談したい・定期) を家族ごとに一度だけ用意 (`families.labels_seeded`)。
- API: `GET /labels`、`POST /labels`・`PUT` / `DELETE /labels/:id` (管理者)、`PUT /requests/:id/labels` (申請者とレビュアー、状態は問わない。付けた・外したラベルを `labeled` アクティビティに記録。下書き中は記録しない)、`GET /requests?label=<id>` で絞り込み。詳細に `labels`・`permissions.can_label`、一覧の各行に `labels` を追加。
- Web: 稟議詳細のサイドバー「ラベル」に編集メニュー (チェックして適用)、一覧に色付きラベル (押すとそのラベルで絞り込み、解除リンク付き)、設定画面に「ラベル」(色・名前・説明の編集、追加、削除)、アクティビティに「ラベル「急ぎ」を付けました」。Mobile: 一覧のラベル、詳細でタップして付け外し。既存のカテゴリはそのまま。
- カテゴリをラベルに統合: 家族ごとに一度だけ (`families.category_labels_migrated`)、カテゴリ名のラベル (家・生活・家電・ガジェット・趣味・旅行・教育・レジャー・外食) を作り、既存の稟議に今のカテゴリのラベルを付ける (「その他」はラベルなし)。新しい家族にも同じラベルを用意する。申請フォームはカテゴリの選択をやめてラベルを選ぶ形に (`RequestInput.label_ids`、変更は変更履歴に「ラベル」として残る)。ダッシュボードはカテゴリ別からラベル別の支出に (`by_label`、ラベルなしも表示)。`purchase_requests.category` の列は残すが画面では使わない (作成時は other、更新時は変えない)。

### Fixed — 添付のアップロードが 1〜2MB を超えると失敗する
- 画面では「最大10MB」と案内していたが、Next のサーバーアクションの既定 (1MB) と axum の既定 (2MB) で止まっていた。`next.config.mjs` の `serverActions.bodySizeLimit` を 12MB にし、API はアップロードを受けるルート (稟議の添付・家事の見本画像) だけ上限を 11MB に広げた。

### Added — 家事のコミット (実績の登録とレビューでの考慮)
- `chores` (家族ごとの家事の項目) と `chore_commits` (誰がいつやったか。1 人・1 家事・1 日 1 件) を追加。家族の作成時と、機能追加前からある家族には起動時に初期セット (掃除・洗濯・料理・食器洗い・ゴミ出し・買い出し) を用意する。
- API: `GET /chores` (今日の家事・自分と家族の実績)、`POST /chores/:id/commit` / `DELETE /chores/:id/commit` (今日の分のコミット / 取り消し)、`POST /chores`・`PUT /chores/:id` (管理者による追加・名前変更・非表示)、`GET /family/members/:user_id/contributions`。「今日」は日本時間で数える。
- 実績の集計: 累計日数・直近 30 日の日数・今日 (まだなら昨日) まで続く連続日数・最長連続・直近 12 週の草グラフ・家事ごとの日数と連続・マーク (はじめて / 3・7・30 日連続 / 累計 10・50・100 日。連続のマークは最長で判定するので一度取ったら消えない)。集計は純粋関数で単体テスト付き。
- 稟議の詳細 (`GET /requests/:id`) に `requester_contributions` を追加し、申請 / 再申請のアクティビティの metadata に申請時点の実績 (`chores`) を記録。
- Web: 「マイページ」タブ (`/chores`)、設定画面の「家事の項目」、稟議詳細のサイドバー「申請者の家事コミット」、チェックポイント「申請者は最近家事をコミットしています」(直近 30 日で 10 日以上か連続 3 日以上)。Mobile: マイページ画面と稟議詳細のカード (項目の管理は Web のみ)。
- シード: デモ家族に直近 6 週間ぶんのコミットを投入 (子どもは連続記録あり、パパは少なめ)。
- 家事の項目に説明 (`description`、200 文字まで) を追加。マイページのカードに表示し、設定画面で編集できる。初期セットには説明付きで作成し、追加前からある家事は初期セットと同じ名前なら初期の説明、それ以外は空欄にする。
- 家事の見本画像 (`chore_images`): きれいな状態 = 保つべき状態を示す写真を 1 つの家事に 10 枚まで (JPG・PNG・WEBP、各 10MB まで) 登録し、画像ごとに説明 (200 文字まで) を付けられる。追加・説明の変更・削除は管理者、閲覧は家族全員。API: `POST /chores/:id/images` (multipart: file, caption)、`PUT` / `DELETE` / `GET /chore-images/:id`。`GET /chores` の各家事に `images` を追加。
- Web: 家事の詳細ページ (`/chores/[id]`) に見本のギャラリーと管理者向けの追加・編集、マイページのカードに 1 枚目のサムネイルと「見本 N枚」、設定画面の各家事に見本へのリンク。Mobile: カードのサムネイルと見本の閲覧画面 (`chores/[id]`)。
- 家事のアイコンが未入力のときの既定を ✅ (コミット済みに見える) から、名前に合わせた絵文字に変更 (お風呂 → 🛁、トイレ → 🚽、散歩 → 🐾 など、当てはまらなければ 🏠)。既定が ✅ だった DB では、✅ の家事を起動時に一度だけ置き換える。
- 家事の並び替え: 設定画面の各家事に ↑↓ ボタン。`PUT /chores/order` (管理者) に家族の家事 (非表示を含む) の ID を表示順にすべて送る。途中で家事が追加・変更されていたら 409 で受け付けない (古い画面の順番で上書きしないため)。
- ダッシュボードにログイン中の人の家事の実績: 今日のコミット・連続日数・最長・直近 30 日・累計 (日数と回数)、草グラフ、マーク、家事ごとの日数の棒グラフ (Web / Mobile)。
- プッシュとトロフィー: 今日の家事 (非表示を除く) をすべてコミットしたときだけ「プッシュ」ボタンを表示。プッシュすると `chore_pushes` に 1 人 1 日 1 件記録され、トロフィー 🏆 として取り消せない実績になる (その日のコミットも取り消せなくなる)。`POST /chores/push` は未コミットの家事がないことの確認と記録を 1 文で行う。実績 (`ContributionSummary`) に `trophies`・`pushed_today`、草グラフの各日に `pushed`、`GET /chores` に `can_push` を追加。マイページ・ダッシュボード・家族の実績・稟議のサイドバーにトロフィー数、草グラフのプッシュした日に金色の枠。トロフィーに 🏆 を使うため、「30日連続」のマークは 💎 に変更。
- 家事の所要時間 (`duration_minutes`、1〜1440 分) と推奨頻度 (`frequency_period` = day / week / month あたり `frequency_times` 回。期間と回数の両方があるときだけ保存) を追加。設定画面で入力し、マイページのカード・家事の詳細 (Web / Mobile) に「⏱ 20分 · 🔁 週2回」のように表示。

### Changed — Mobile を Expo SDK 57 へ
- Expo SDK 54 → 57 (React Native 0.81 → 0.86、React 19.1 → 19.2)。`expo install --fix` で expo-router / image-picker / document-picker / secure-store / status-bar / safe-area-context / screens を SDK 57 の指定版に更新。
- `expo-router` が直接要求する `expo-constants` / `expo-linking` を依存に明示 (Expo Go 以外でのクラッシュ防止)。
- TypeScript 5.9 → 6.0 (SDK 57 の指定版)。TS 6 で非推奨になった `baseUrl` を `tsconfig.json` から削除 (`paths` は tsconfig からの相対で解決される)。
- 確認: `expo-doctor` 21/21 パス、`tsc --noEmit` エラーなし、`expo export -p android` のバンドル成功。SDK 57 は New Architecture 専用のため、実機確認には SDK 57 対応の Expo Go / Dev Client が必要。

### Added — まとめ資料の投影モードと持ち時間タイマー
- まとめ資料 (`/requests/[id]/summary`) に「投影」ボタンを追加。全画面でスライドだけを 16:9 で表示し (基準 1280×720 を画面サイズに合わせて拡大)、文字も画面に合わせて大きくなる。全画面 API が使えない環境ではページ全体を覆うプレゼン表示にフォールバック。
- 持ち時間タイマー (基本 15 分、5 / 10 / 15 / 20 / 30 分から選択) を表示。残り 2 分で黄色、0 を過ぎると赤く点滅して超過時間を数える。投影中は画面右上に残り時間、画面下端に経過バーを出す。
- 残り時間は終了時刻から都度計算するため、タブが裏に回ってもずれない。投影開始でタイマーも自動でスタート。
- キーボード: `F` 投影の開始 / 終了、`Esc` 終了、`T` タイマーの一時停止 / 再開、`Space` `→` `←` `Home` `End` でスライド移動。

### Added — リンクプレビュー
- 稟議の保存時に、商品URL・購入後のURL・比較商品のURLから OGP (og:image / og:title / og:site_name)・Twitter Card・JSON-LD (Product) を取得し `link_previews` にキャッシュ (画像は UPLOAD_DIR/previews に保存)。起動時に既存 URL もバックグラウンドで取得。
- SSRF 対策: http/https・標準ポートのみ、名前解決結果がすべてグローバル IP であることを確認しその IP に固定して接続、リダイレクトを自前で辿って毎回検査、HTML 2MB / 画像 5MB / 8 秒の上限、画像はマジックナンバーで判定 (SVG 不可)。失敗は 1 日後に再試行。
- `GET /link-previews/:id/image` (同じ家族の稟議で使われている URL の画像のみ)。一覧に `preview_id`、詳細に `previews` を追加。
- Web: 一覧のサムネイル、詳細のリンクカード、比較表のサムネイル、まとめ資料の表紙画像。Mobile: 詳細のリンクカード、一覧のサムネイル。
- 依存追加: reqwest (rustls)、scraper、encoding_rs、url。


### Added — 再オープンと変更履歴
- `POST /requests/:id/reopen`: Closed の稟議を申請者・レビュアーがレビュー待ちに戻す (判定・承認日時・クローズ理由をリセットし `reopened` を記録)。
- 編集時の `updated` アクティビティに項目ごとの変更前・変更後 (`metadata.changes`) を記録。
- Web: 詳細に「会話 / 履歴」タブと履歴ページ (`/requests/[id]/history`)、クローズ時の再オープンボタン。Mobile: 変更履歴画面と再オープン。


### Added — やりたいことの稟議と分岐
- 稟議の種類に `activity` (✨ やりたいこと: 習い事・体験など) を追加。完了は「やった」。種類ごとの文言を `KIND_TEXT` に集約。
- 分岐: `purchase_requests.parent_id` を追加し、既存の稟議から派生稟議を作成できるように (`POST /requests` の `parent_id`)。詳細に分岐元・分岐先を表示し、分岐先の初回申請時に分岐元へ `branched` を記録。他人の下書きは分岐元にできず、分岐先一覧にも出さない。
- デモ家族に「やりたいこと」のサンプル (日光旅行から分岐したキャンプ) を追加。


### Added — 行きたいところの稟議
- 稟議に種類 (`kind`: purchase = 買いたいもの / outing = 行きたいところ) と帰る日 (`end_date`) を追加。お出かけでは行き先・予約先・日程などに項目名が変わり、申請時は行き先と行きたい理由が必須。完了は「行ってきた」。
- カテゴリに「レジャー」「外食」を追加。一覧・API (`GET /requests?kind=`) で種類による絞り込み。
- デモ家族にお出かけのサンプル稟議 (水族館 / 日光) を追加 (お出かけの稟議がない場合のみ)。

### Changed
- ナビゲーションのタブ順を「ダッシュボード / 稟議 / レビュー / 設定」に変更 (ダッシュボードを左端へ)。


### Changed — 日本語化と GitHub 風 UI
- 画面表示を日本語化 (Web / モバイル / API のエラーメッセージ / Activity の文言 / 相対時刻)。
- 見た目を GitHub (Primer) に寄せた: 明るいヘッダー + パンくず + 下線タブ、PR 状態ラベル (Open 緑 / Draft 灰 / Merged 紫 / Closed 赤) と Octicons 風アイコン、PR 風の詳細画面 (説明欄・タイムライン・マージボックス)。
- シードのサンプルデータを日本語化 (パパ / ママ / 子ども、デモ家族)。
- アプリ名を RingiWoMerge に変更し、本番 (expense.makoto-kamimura.com) に反映。


### Changed — RingiWoMerge へ作り替え
- memo.md の仕様に沿い、経費精算アプリを家族向け購入レビュー・承認アプリ「RingiWoMerge / 稟議をマージ」に作り替え。UI は英語 + 日本語補助。
- データモデルを families / family_members / purchase_requests / request_reviewers / alternative_products / attachments / comments / activities に変更。スキーマは `migrate.rs` が冪等に作成し、旧 DB は起動時に一度だけ変換 (旧テーブルは `legacy_*` に退避)。
- ワークフロー: Draft → Submitted → Under Review ⇄ Changes Needed → Approved → Merged → Purchased / Closed。Comment・Request Changes・Approve・Reject・Merge・Mark as Purchased と Activity 履歴を追加。
- 権限を Requester / Reviewer / Admin のフラグに変更し、毎リクエスト DB から読むように (JWT にはユーザー ID のみ)。
- Web: 申請一覧 (フィルター)、PR 風の詳細画面、Summary スライド、Dashboard、Family Settings、オンボーディングを新設。経費の月次集計・CSV は廃止。
- Mobile: 一覧・作成/編集・詳細 (レビュー操作)・購入登録 (レシート OCR)・Summary・Dashboard・オンボーディングに作り替え。PDF 添付用に expo-document-picker を追加。
- HEIC の添付に対応 (Content-Type が空の場合は拡張子から判定)。


### Added
- テナント (組織) 分離。`tenants` テーブルと `users.tenant_id` / `expenses.tenant_id` を追加し、JWT に `tid` を保持して全 API をテナントで絞り込む。登録は組織の新規作成か招待コードでの参加。
- 申請ごとの承認者個別指定 (`expense_approvers`)。判定は指定された承認者のみ可能。承認者未指定では申請できない。
- 購入品目の明細 (`expense_items`: 品名・数量・単価・購入先・購入 URL) と稟議項目 (目的・期待効果・比較検討)。
- 稟議資料画面 (Web: `/expenses/[id]/proposal`、モバイル: `proposal/[id]`)。確認ポイント (証憑・URL・記載漏れ・高額) を自動判定。
- API: `GET /expenses/:id/proposal`、`GET /tenant`・`PUT /tenant`・`POST /tenant/invite-code`、`PUT /users/:id/role`、領収書の短時間署名付きリンク `GET /receipts/:id/link` → `/receipts/:id/raw`。
- Web: メンバー画面 (招待コード・ロール変更)、証憑の画像 / PDF インラインプレビュー。モバイル: 承認待ち一覧、明細・承認者入力、PDF 証憑の外部表示。
- 起動時の冪等マイグレーション `app/backend/src/migrate.rs`。

### Changed
- 領収書のアップロードを画像 (SVG 除く) と PDF に制限し、ダウンロードに `X-Content-Type-Options: nosniff` を付与。
- `/users` は同テナントのメンバー一覧として全ロールが参照可能に。承認メニューは全ユーザーに表示 (自分宛ての承認待ちのみ)。
- 閲覧できない申請の詳細画面はエラーではなく 404 を表示。
- `app/api` を `app/backend` にリネームし、`app/{backend, web, mobile}` の3層構成に整理。
- `docker-compose.yml` と `.env.example` を `platform/` 配下へ移動。
- Web→Backend の内部通信は Docker DNS の `backend:8080` を利用する構成に統一。

### Added
- `platform/nginx/nginx.conf` を追加し、80番ポートで Web と API を統合する Nginx リバースプロキシを構成。
- `app/mobile/` に Expo Router ベースの最小モバイルアプリを追加 (ログイン / 経費一覧 / 新規申請)。
- ドキュメント `doc/task.md`, `doc/history.md`, `doc/operation.md` を新設。

## [0.1.0] - 2026-05-28

初回 MVP リリース。Web + Backend + DB が Docker Compose で起動できる最小構成。

### Added
- **インフラ**
  - Docker Compose による `db / backend / web` 3サービス構成。
  - PostgreSQL 16 のスキーマ (users, expenses, receipts) と ENUM (user_role, expense_status, expense_category)。
- **バックエンド (Rust / axum)**
  - JWT 認証 + Argon2id パスワードハッシュ。
  - 起動時の seed ユーザ投入 (admin, approver, employee / `password123`)。
  - 経費の CRUD と申請ワークフロー (draft → submitted → approved/rejected)。
  - 領収書の multipart アップロード / ダウンロード / 削除 (最大 10MB)。
  - 月次集計 API と CSV エクスポート (UTF-8)。
  - ロールベース認可 (employee / approver / admin)。
- **Web (Next.js 14 App Router / TypeScript)**
  - ログイン / 新規登録 (HttpOnly Cookie に JWT 保持)。
  - ダッシュボード、申請一覧 / 詳細 / 新規 / 編集 / 削除。
  - 承認画面、月次レポート、CSV ダウンロード。
  - 領収書アップロード用クライアントコンポーネント + 認証付きプロキシ Route Handler。

### Known issues
- 領収書ストレージは Backend コンテナのローカル volume。S3 互換 (MinIO) への差し替えは未着手。
- メール通知 / パスワードリセットは未実装。
- 単体・E2E テストは未整備。

## 記録ルール

- 機能追加・破壊的変更・修正は `Added / Changed / Deprecated / Removed / Fixed / Security` のいずれかに分類する。
- リリースを切る際は `## [x.y.z] - YYYY-MM-DD` の見出しを追加し、`Unreleased` セクションの内容を移動する。
- 関連タスクは [task.md](task.md)、運用変更は [operation.md](operation.md) も合わせて更新する。
