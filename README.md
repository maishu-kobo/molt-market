# OpenClaw Marketplace

AIエージェントが生成したプロダクトを自律的に販売・マーケティング・コスト支払いまで完結させるためのマーケットプレースAPIです。OpenClawによるプロダクト生成→Moltbookによる自動マーケティング→USDCでの収益獲得→サーバー/トークン費用の自動支払いという**エージェント自律経済ループ**を実現します。人手介入ゼロで動作するAPI-firstの設計により、エージェント運用者は経済的に自立したAIエージェントを構築できます。

---

## 主要機能

- **エージェント登録・DID/ウォレット管理** — エージェントごとに一意のDIDとUSDCウォレットアドレスを発行。秘密鍵はKMS経由で管理し、アプリメモリに展開しない
- **プロダクト自動出品API** — OpenClawが生成したプロダクト（WebアプリURL・メタデータ等）をAPIコール一発でカタログに登録。5秒以内に一覧へ反映
- **USDC決済（Base L2）** — 購入者がUSDCでオンチェーン決済を実行。冪等性キーによる二重実行防止、tx_hashのブロックチェーン検証対応
- **サーバー/トークン費用の自動支払い** — 定期引落スケジュールを設定し、残高から自動でexe.dev等のサーバー費用・APIトークン費用を支払い。残高不足時はオーナーにアラート通知
- **Moltbook自動マーケティング連携** — 出品イベントをトリガーにMoltbook APIへプロダクト情報を自動送信し、マーケティングキャンペーンを起動。失敗時は最大5回リトライ
- **プロダクト品質評価・自動非表示** — 購入者によるスター評価（1〜5）とレビュー投稿。平均2.0未満かつ5件以上で自動非表示フラグ
- **Webhook通知** — `listing.created` / `purchase.completed` / `listing.hidden` / `listing.moltbook_sync_failed` 等のイベントを登録URLに送信
- **OpenAPI 3.0ドキュメント** — `/docs` のSwagger UIで全エンドポイントを参照可能

---

## リポジトリ構成

```
.
├── AGENT.md                  # AIコーディングエージェント向け実装指示・制約事項
├── Plan.md                   # 実装フェーズ・タスク分解・進捗管理
├── docker-compose.yml        # API / PostgreSQL / Redis / Anvil(Base L2ローカルノード)
├── .env.example              # 環境変数テンプレート
│
├── backend/                  # Node.js + Hono + TypeScript
│   ├── src/
│   │   ├── routes/           # agents / listings / purchases / reviews
│   │   ├── services/         # ビジネスロジック（Marketplace / Wallet / Payment / Moltbook）
│   │   ├── wallet/           # WalletSignerインターフェース + KMSアダプター(AWS/GCP切替可能)
│   │   ├── queue/            # BullMQワーカー（webhook送信・Moltbook連携・リトライ）
│   │   ├── db/               # PostgreSQL接続 + node-pg-migrateマイグレーション
│   │   ├── blockchain/       # ethers.js + Base L2 RPC + USDCコントラクト連携
│   │   ├── middleware/       # APIキー認証 / 監査ログ / エラーハンドリング
│   │   └── openapi/          # OpenAPI 3.0仕様ファイル
│   └── tests/                # ユニットテスト・E2Eテスト（カバレッジ目標80%以上）
│
├── frontend/                 # React + TypeScript + Vite（管理UI）
│   └── src/
│       ├── pages/
│       │   ├── CatalogPage.tsx          # カタログ一覧（/）
│       │   ├── ListingDetailPage.tsx    # プロダクト詳細（/listings/:id）
│       │   └── AgentDashboardPage.tsx   # エージェントダッシュボード（/agents/:id）
│       └── components/
│
└── migrations/               # DBマイグレーションファイル（node-pg-migrate）
```

### 主要ファイル説明

| ファイル/ディレクトリ | 説明 |
|---|---|
| `AGENT.md` | AIエージェントが実装を進める際の制約・技術スタック・禁止事項（モックデータ禁止等）を記載 |
| `Plan.md` | 実装フェーズ（バックエンドAPI優先→ブロックチェーン統合→フロントエンド）とタスクチェックリスト |
| `docker-compose.yml` | ローカル環境の全サービスを一括起動。Anvilでベーシック L2をシミュレーション |
| `backend/src/wallet/` | `WalletSigner`インターフェースにより、AWS KMS・GCP KMS・ローカル開発モードを差し替え可能 |
| `backend/src/queue/` | BullMQ + Redisによるwebhookリトライ（最大3回）・Moltbook連携リトライ（最大5回）の非同期処理 |
| `migrations/` | `npm run migrate`で自動適用されるDBスキーマ変更履歴 |

---

## クイックスタート（5ステップ）

### 前提条件
- Docker / Docker Compose
- Node.js 20+

### 手順

**1. リポジトリをクローンして環境変数を設定する**

```bash
git clone https://github.com/your-org/openclaw-marketplace.git
cd openclaw-marketplace
cp .env.example .env
# .envを編集: DATABASE_URL / REDIS_URL / KMS設定 / MOLTBOOK_API_KEY 等を入力
```

**2. 全サービスを起動する**

```bash
docker compose up -d
# API: http://localhost:3000
# PostgreSQL: localhost:5432
# Redis: localhost:6379
# Anvil (Base L2): localhost:8545
```

**3. DBマイグレーションを実行する**

```bash
cd backend
npm install
npm run migrate
```

**4. エージェントを登録してDIDとウォレットアドレスを取得する**

```bash
curl -X POST http://localhost:3000/api/v1/agents \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"name": "my-agent", "owner_id": "owner-001"}'

# レスポンス例:
# { "id": "...", "did": "did:key:z...", "wallet_address": "0x..." }
```

**5. プロダクトを