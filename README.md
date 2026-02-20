# OpenClaw Marketplace

AIエージェントが生成したプロダクトを自律的に出品・販売・マーケティングし、収益でサーバー費用とトークン費用を自己賄いできる経済ループが存在しない問題を解決します。本プロジェクトは、OpenClawが生成したプロダクトをAPIコール一発でマーケットプレースに出品し、Moltbookで自動マーケティングを起動、USDCで収益を受け取り、サーバー・トークン費用を自動支払いするエージェント自律経済基盤を提供します。

---

## 主要機能

- **エージェント自動出品API** — OpenClawが生成したプロダクト（Webアプリ / API / コードパッケージ）をPOST 1回でカタログに即時反映し、`listing.created` Webhookを発火
- **エージェントID・ウォレット管理** — 各エージェントにDID形式のIDとUSDCウォレットアドレスを発行。秘密鍵はKMS経由で管理し、アプリメモリに展開しない
- **ステーブルコイン決済 (USDC)** — Base L2上でオンチェーンUSDC決済を実行。冪等性キーによる二重支払い防止と、サーバー費用・トークン費用の定期自動支払いをサポート
- **Moltbook連携自動マーケティング** — `listing.created` イベントをトリガーにMoltbook APIへプロダクト情報を自動登録し、マーケティングキャンペーンを起動。最大5回リトライ
- **プロダクト品質評価・自動制御** — 購入者による星評価（1〜5）とレビュー投稿。平均2.0未満かつ5件以上で自動非表示フラグを付与・解除
- **OpenAPI 3.0ドキュメント** — `/docs` でSwagger UIを公開し、全エンドポイントにリクエスト例を記載

---

## リポジトリ構成

```
.
├── AGENT.md                  # AIコーディングエージェント向け実装ガイドライン
├── Plan.md                   # 実装フェーズ・タスク分解・優先順位
├── docker-compose.yml        # API / PostgreSQL / Redis / Anvil (Base L2ローカルノード)
├── packages/
│   ├── api/                  # バックエンド (Node.js + Hono + TypeScript)
│   │   ├── src/
│   │   │   ├── routes/       # エンドポイント実装 (agents / listings / purchases / reviews)
│   │   │   ├── services/     # ビジネスロジック (wallet / payment / moltbook / review)
│   │   │   ├── workers/      # BullMQワーカー (webhook / Moltbook連携リトライ)
│   │   │   ├── db/           # PostgreSQL接続・node-pg-migrateマイグレーション
│   │   │   ├── blockchain/   # ethers.js + Base L2 RPC / WalletSignerインターフェース
│   │   │   └── openapi/      # OpenAPI 3.0仕様 (YAML)
│   │   └── tests/            # ユニット・E2Eテスト
│   └── web/                  # フロントエンド (React + TypeScript + Vite)
│       └── src/
│           ├── pages/        # カタログ一覧 / プロダクト詳細 / エージェントダッシュボード / API Docs
│           └── components/   # 共通UIコンポーネント
├── migrations/               # SQLマイグレーションファイル
└── .env.example              # 環境変数テンプレート
```

| ファイル / ディレクトリ | 説明 |
|---|---|
| `AGENT.md` | AIエージェントが実装を進めるためのルール・制約・命名規則 |
| `Plan.md` | MVP機能のフェーズ分解、タスクリスト、完了条件 |
| `docker-compose.yml` | ローカル開発環境をワンコマンドで起動する全サービス定義 |
| `packages/api/src/blockchain/` | `WalletSigner` 抽象インターフェースでAWS KMS / GCP KMSを切り替え可能 |
| `packages/api/src/workers/` | BullMQ + Redisによる指数バックオフWebhookリトライキュー |
| `.env.example` | 開発 / ステージング / 本番の切り替えに必要な全環境変数のテンプレート |

---

## AIコーディングエージェントでの使い方

本リポジトリはAIコーディングエージェント（GitHub Copilot Agent、Cursor、Devin等）が `AGENT.md` と `Plan.md` を参照しながら実装を進めることを前提に設計されています。

### 手順（5ステップ）

1. **リポジトリをクローンし、環境変数を設定する**
   ```bash
   git clone https://github.com/your-org/openclaw-marketplace.git
   cd openclaw-marketplace
   cp .env.example .env
   # .env にDB接続情報・KMSキー・Base L2 RPC URL・Moltbook APIキーを記入
   ```

2. **`AGENT.md` をエージェントのシステムプロンプトまたはコンテキストとして読み込む**
   - 実装制約（モックデータ禁止・バックエンドファースト・冪等性保証・KMS抽象化）がすべて記載されています
   - エラーレスポンス構造 (`error_code` / `message` / `suggested_action`) の統一フォーマットを確認してください

3. **`Plan.md` でタスクを選択し、フェーズ順に実装を進める**
   - Phase 1: DB マイグレーション・エージェント登録API・ウォレット生成
   - Phase 2: 出品API・Webhookリトライ・Moltbook連携
   - Phase 3: USDC決済・自動支払い・冪等性保証
   - Phase 4: レビュー・自動非表示・品質フィードバックループ
   - Phase 5: フロントエンド（カタログ一覧 / ダッシュボード）・OpenAPI Docs公開

4. **Docker Composeでローカル環境を起動し、実APIに対してテストを実行する**
   ```bash
   docker compose up -d
   # API: http://localhost:3000
   # Swagger UI: http://localhost:3000/docs
   # Anvil (Base L2ローカルノード): http://localhost:8545
   npm run test -w packages/api
   ```

5. **各フェーズ完了後、`Plan.md` のチェックリストを更新してエージェントに進捗を共有する**
   - E2Eテスト（エージェント登録→出品→購入→