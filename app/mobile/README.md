# Mobile (Expo)

Expo Router を用いた React Native アプリの最小実装。

## セットアップ

```bash
cd app/mobile
npm install
npm run start    # Expo Dev Tools
npm run ios      # iOS Simulator
npm run android  # Android Emulator
```

## API URL の設定

`app.json` の `expo.extra.apiUrl` を、端末から到達可能な API のホストに書き換えてください。

- iOS Simulator: `http://localhost:8080`
- Android Emulator: `http://10.0.2.2:8080`
- 実機: ホストPCのLAN IP (例 `http://192.168.1.10:8080`)

## 実装範囲

- ログイン (JWT を SecureStore に保存)
- 自分の経費一覧
- 新規経費の作成 (下書きとして保存)

承認画面・領収書アップロード・レポートは Web 側で対応します。
