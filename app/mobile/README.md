# Mobile (Expo)

RingiWoMerge の Expo Router を用いた React Native アプリ。

| 項目 | バージョン |
|------|-----------|
| Expo SDK | 57 (React Native 0.86 / React 19.2) |
| Expo Router | `expo-router@57` (SDK と同じ番号) |
| TypeScript | 6.0 |

SDK 57 は New Architecture 専用のため、Expo Go も SDK 57 対応版が必要。

## セットアップ

```bash
cd app/mobile
npm install
npm run start    # Expo Dev Tools
npm run ios      # iOS Simulator
npm run android  # Android Emulator
```

## API URL の設定

接続先は次の順に決まる ([src/api.ts](src/api.ts))。

1. 環境変数 `EXPO_PUBLIC_API_BASE_URL` (Metro の起動時に指定)。公開デモでは API が 8080 番を公開していないため、`platform/scripts/expo-demo.sh` が `https://expense.makoto-kamimura.com/api` を指定して起動する
2. Expo Go で開発中は、Metro を配信しているホストの IP の 8080 番
3. `app.json` の `expo.extra.apiUrl`

Expo Go では環境変数を指定しない限り 2 が使われるため、`app.json` を書き換えても効かない。別の接続先にしたいときは環境変数で指定する。
ローカルの Docker Compose は API を 127.0.0.1:8082 にだけ公開している。

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:8082 npx expo start      # iOS Simulator
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8082 npx expo start       # Android Emulator
EXPO_PUBLIC_API_BASE_URL=https://expense.makoto-kamimura.com/api npx expo start   # 実機から公開デモの API を使う
```

## 実装範囲

- ログイン (JWT を SecureStore に保存)
- オンボーディング
- 稟議の一覧 (状態・種類の絞り込み、ラベル表示)・作成・編集 (下書き保存 / 申請、ラベルの選択)
- 稟議の詳細 (承認 / 修正依頼 / 却下 / マージ / 再オープン / コメント / 添付 / ラベルの付け外し / 分岐 / リンクプレビュー / 申請者の家事の実績)
- 変更履歴、購入済みの記録 (レシート撮影 + OCR)、まとめ資料
- ダッシュボード (ラベル別の支出、自分の家事の実績)
- マイページ (家事のコミット・プッシュ、推奨頻度のタブと合計所要時間、「まだ / 済み / すべて」の絞り込み、きれいな状態の見本の閲覧)
- 家族・ラベル・家事の項目の管理は Web のみ
