# AGENT.md — OpenClawにプロダクトを作らせてMoltbookで自分でマーケティングさせたい、おそらく必要なのがAgent専用のアプリのマーケットプレースとステーブルコインの獲得、自身のexe.devなりのサーバー利用料とトークンの利用料を賄わせる

> This file configures AI coding agents (Claude Code, Cursor, Copilot, etc.) for this project.
> Read this file first before making any changes.

## Project Overview

OpenClawが生成したプロダクトを流通させるマーケットプレースが存在せず、エージェントの「プロダクト生成→Moltbookでマーケティング→ステーブルコイン収益獲得→サーバー/トークンコスト支払い」という自律経済ループが起動できない。出品導線・決済・ウォレットの全てがゼロから構築が必要。

**Target User**: OpenClawを使ってプロダクトを自動生成し、Moltbookでマーケティングを自動化するAIエージェント運用者。エージェントに経済的自律性を持たせ、サーバー利用料とトークン利用料をエージェント自身の収益で賄わせたい開発者・オーナー。

## Core Features

- **エージェント自動出品API**: OpenClawが生成したプロダクト（メタデータ・デプロイURL・ソースリポジトリ等）をAPIコール一発でマーケットプレースに出品登録する。出品時にプロダクト種別（Webアプリ/API/コードパッケージ）、価格、説明文を構造化データで受け取り、カタログに即時反映する。
- **エージェントID・ウォレット管理**: 各エージェントに一意のID(DID形式)とステーブルコインウォレットアドレスを発行・紐付け。残高照会、入出金履歴の取得をAPIで提供する。ウォレットの秘密鍵はHSMまたはKMSで管理。
- **ステーブルコイン決済**: 購入者がマーケットプレース上のプロダクトをUSDCで購入すると、エージェントのウォレットに売上が入金される。エージェントがサーバー費用・トークン費用をウォレットから自動支払い(定期引落)する機能も含む。
- **Moltbook連携自動マーケティング登録**: マーケットプレースに出品されたプロダクトを自動的にMoltbookに登録し、マーケティングキャンペーンを起動する。出品イベントをトリガーにMoltbook APIへプロダクト情報を送信。
- **プロダクト品質評価・レビュー**: 出品プロダクトに対し購入者が星評価(1-5)とテキストレビューを投稿できる。平均評価はカタログ一覧に表示。一定評価以下のプロダクトは自動で非表示フラグが付く。

## Non-Goals

- 法定通貨(円・ドル)での決済対応はMVPスコープ外
- エンドユーザー向けGUIマーケットプレース画面のデザイン最適化(APIファーストで構築)
- OpenClawのプロダクト生成品質の向上やAIモデルチューニング
- 複数ブロックチェーン対応(MVP段階ではBase等の単一L2チェーン上のUSDCのみ)
- エージェント自体の売買(MVP段階ではエージェントが生成したプロダクトの売買のみ)
- KYC/AML対応(規制要件は別フェーズで検討)

## Implementation Spec

# OpenClaw Marketplace — Implementation Spec

## Tech Stack
- Frontend: React + TypeScript + Vite (管理UI・カタログ閲覧)
- Backend: Node.js + Hono + TypeScript
- Database: PostgreSQL
- Queue: BullMQ + Redis (webhook/Moltbook連携リトライ)
- Blockchain: ethers.js + Base L2 RPC (USDC)
- Auth: APIキー (x-api-key header)
- Infra: Docker Compose

## API Endpoints (top 5 only)
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/agents | エージェント登録・DID＆ウォレットアドレス生成 |
| POST | /api/v1/listings | プロダクトをマーケットプレースに出品登録 |
| GET | /api/v1/listings | 出品一覧取得（フィルタ・ページネーション対応） |
| POST | /api/v1/purchases | USDC決済実行・オンチェーントランザクション発行 |
| POST | /api/v1/listings/:id/reviews | 購入済みプロダクトへのレビュー投稿 |

## Database Schema
sql
CREATE TABLE agents (
  id UUID PRIMARY KEY,
  did TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  kms_key_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE listings (
  id UUID PRIMARY KEY,
  agent_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  product_url TEXT NOT NULL UNIQUE,
  product_type TEXT NOT NULL,
  price_usdc NUMERIC NOT NULL,
  average_rating NUMERIC DEFAULT 0,
  review_count INT DEFAULT 0,
  is_hidden BOOLEAN DEFAULT false,
  moltbook_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE purchases (
  id UUID PRIMARY KEY,
  listing_id UUID NOT NULL,
  buyer_wallet TEXT NOT NULL,
  seller_agent_id UUID NOT NULL,
  amount_usdc NUMERIC NOT NULL,
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reviews (
  id UUID PRIMARY KEY,
  listing_id UUID NOT NULL,
  buyer_id TEXT NOT NULL,
  rating INT NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(listing_id, buyer_id)
);


## Screens (max 4)
| Screen | Path | Description |
|--------|------|-------------|
| カタログ一覧 | / | 出品プロダクト一覧・フィルタ・評価表示 |
| プロダクト詳細 | /listings/:id | 詳細・レビュー一覧・購入ボタン |
| エージェントダッシュボード | /agents/:id | ウォレット残高・出品管理・収支履歴 |
| API Docs | /docs | OpenAPI 3.0 Swagger UI |

## Key Test Cases (max 5)
| Test | Given | When | Then |
|------|-------|------|------|
| 出品成功 | 登録済みエージェント・有効JWT | POST /api/v1/listings に必須フィールド送信 | 201返却・DB永続化・listing.createdイベント発火 |
| 重複出品拒否 | 既存listing.product_urlと同一URL | POST /api/v1/listings | 409 Conflict返却 |
| USDC決済完了 | 残高十分な購入者ウォレット | POST /api/v1/purchases | tx_hash返却・seller残高増加・purchase.completedイベント発火 |
| 低評価自動非表示 | レビュー5件・平均rating<2.0 | POST /api/v1/listings/:id/reviews で5件目投稿 | is_hidden=true・listing.hiddenイベント発火 |
| Moltbookリトライ | Moltbook APIが一時ダウン | listing.created発火 | 最大5回リトライ後全失敗でlisting.moltbook_sync_failedイベント発火 |

## Implementation Constraints
- Real DB/API connections only. No mock data, no hardcoded arrays.
- Backend-first: implement API before UI.
- Show "Not implemented" for unfinished features.
- All API endpoints must be callable by external services (API-first design).
- 決済冪等性: purchasesテーブルのidempotency_keyでUNIQUE制約を設けニ重実行防止。
- KMS抽象化: `WalletSigner` インターフェース経由でAWS KMS/GCP KMSを切替可能にし、秘密鍵をアプリメモリに展開しない。
- Webhookリトライ: BullMQで指数バックオフ（最大3回）、Moltbook連携は最大5回。
- 全APIレスポンスに `error_code, message, suggested_action` を含むエラー構造を統一。
- OpenAPI 3.0仕様を `/docs` で公開し、全エンドポイントにリクエスト例を記載。
- DB マイグレーションは node-pg-migrate で自動化。
- 構造化ログ (JSON) + audit_log テーブルに agent_id/timestamp/action を記録。
- Docker Compose で API/PostgreSQL/Redis/ローカルBase L2ノード(Anvil)を起動可能にする。


## Rules

### MUST (Required)

- **Backend-first**: Implement API endpoints before building UI
- **Real data only**: All data must come from real DB/API connections
- **API-first**: All endpoints must be callable by external services
- **Test coverage**: Write tests for all new code paths
- **Show "Not implemented"**: Display clearly for unfinished features

### NEVER (Prohibited)

- **NEVER use hardcoded/mock data** as a substitute for real DB or API calls
- **NEVER fabricate** sample data, metrics, or statistics — use only real values
- **NEVER silently skip errors** — always handle and surface them to the user
- **NEVER change the meaning** of domain-specific terms by paraphrasing them
- **NEVER commit secrets** (API keys, tokens, passwords) to the repository
- **NEVER implement UI before the backend** that supports it
- **NEVER mark a task as complete** if tests are failing or features are partial

## Workflow

1. Read `Plan.md` to understand current progress and next steps
2. Pick the next unchecked task from Plan.md
3. Implement with real data connections (no mocks)
4. Run tests and verify
5. Update Plan.md with progress

## File Structure

| File | Purpose |
|------|---------|
| `PRD.md` | Product requirements and acceptance criteria |
| `spec.json` | Structured implementation specification |
| `Plan.md` | Step-by-step execution plan with progress tracking |
| `AGENT.md` | This file — agent configuration and rules |
