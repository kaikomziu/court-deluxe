# COURT DELUXE

部屋を作って役職(タグ)を決め、裁判官BOTの進行でリアルタイムに議論する模擬裁判・会議アプリ。

公開URL: https://kaikomziu.github.io/court-deluxe/

## 遊び方
1. 「部屋を作る」でお題・パスワード・役職(原告/被告人/弁護人/証人/傍聴人、独自役職も追加可)の人数を設定して部屋を作成。
2. 参加者は部屋コード+パスワードで入室し、ニックネームと役職を選ぶ。
3. ホストが「開廷する」を押すと裁判官BOTが開廷宣言・出席確認・進行説明を行い、最初の役職を指名する。
4. 「次を指名」(ホストのみ)で発言順を進行、誰でも⭐で重要な発言にマークを付けられる。
5. 誰でも「まとめを求める」を押すと、裁判官BOTが各役職の代表的な発言(⭐優先)を論点整理として提示する。**判決や勝敗は出さない。**

## 構成
- `index.html` + `css/style.css` — マークアップ/スタイル
- `js/config.js` — Supabase接続設定
- `js/supabase-client.js` — Supabaseクライアント初期化
- `js/state.js` — クライアントID・ハッシュ等のユーティリティ
- `js/roles.js` — 役職(タグ)の定義
- `js/judge.js` — 裁判官BOTのセリフ生成・まとめ生成(テンプレートによる決定論的処理、外部AI呼び出しなし)
- `js/room.js` — Supabaseとの通信(部屋作成/参加/メッセージ/スター等)
- `js/lobby.js` / `js/courtroom.js` — 各画面の描画とイベント処理
- `js/app.js` — 全体のルーティング・状態管理・リアルタイム購読

## バックエンド
共有Supabaseプロジェクト(テーブル接頭辞 `court_`)。`court_rooms` / `court_participants` / `court_messages` / `court_message_stars` の4テーブルとRPC(`court_toggle_star` / `court_try_open` / `court_try_conclude`)で構成。リアルタイム更新は `postgres_changes` 購読。
