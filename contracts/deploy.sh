#!/bin/sh
set -e

ANVIL_RPC="http://anvil:8545"
# Anvil default account #0 private key
DEPLOYER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
# 1,000,000 USDC (6 decimals)
INITIAL_SUPPLY="1000000000000"

echo "Waiting for Anvil..."
until cast block-number --rpc-url "$ANVIL_RPC" 2>/dev/null; do
  sleep 1
done
echo "Anvil is ready."

cd /contracts

echo "Building TestUSDC..."
forge build

echo "Deploying TestUSDC..."
DEPLOY_OUTPUT=$(forge create src/TestUSDC.sol:TestUSDC \
  --rpc-url "$ANVIL_RPC" \
  --private-key "$DEPLOYER_KEY" \
  --constructor-args "$INITIAL_SUPPLY")

ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "Deployed to:" | awk '{print $3}')
echo "USDC_CONTRACT_ADDRESS=$ADDRESS" > /data/usdc.env
echo "TestUSDC deployed to: $ADDRESS"

echo "Done."
