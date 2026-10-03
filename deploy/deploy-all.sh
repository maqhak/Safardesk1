#!/usr/bin/env bash
#
# deploy-all.sh — Roll out ONE SafarDesk build to EVERY buyer.
#
# Usage:
#   ./deploy/deploy-all.sh [--version v1.2.0] [--rules] [--dry-run] [--yes]
#
# Flow:
#   1. Build ONCE (production). The SAME dist/ goes to every buyer.
#   2. Tag the release in git (vX.Y.Z) so the deployed code is traceable.
#   3. Deploy buyer-by-buyer from buyers.registry.json.
#   4. Keep going if one buyer fails; print a summary + failed list at the end.
#   5. Append every result to deploy/releases.log.
#
# DATA-LOSS GUARANTEE:
#   Only "hosting" (+ optionally "firestore:rules") targets are ever deployed.
#   Firestore DATA (buyer documents) is never read, written or deleted.
#   New features arrive with the new build; new collections are enabled by
#   rules; old documents keep working (app reads new fields with fallbacks).
#
# RECOMMENDED COMPLAINT FLOW:
#   1. Fix in main repo, push.
#   2. ./deploy/deploy-buyer.sh <complaining-buyer-id> --version vX.Y.Z --rules
#      -> verify the fix on that buyer's live app.
#   3. ./deploy/deploy-all.sh --version vX.Y.Z --rules   (this script)
#      -> everyone gets the fix within minutes.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REGISTRY="$SCRIPT_DIR/buyers.registry.json"
LOG="$SCRIPT_DIR/releases.log"

VERSION=""
DEPLOY_RULES=0
DRY_RUN=0
ASSUME_YES=0

for arg in "$@"; do
  case "$arg" in
    --version=*) VERSION="${arg#*=}" ;;
    --version) ;;
    --rules) DEPLOY_RULES=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --yes) ASSUME_YES=1 ;;
    v*) VERSION="$arg" ;;
    *)
      if [[ "$arg" =~ (delete|destroy|purge|wipe|firestore:delete) ]]; then
        echo "ABORTED: destructive argument '$arg' is never allowed in deploy scripts." >&2
        exit 1
      fi
      ;;
  esac
done
for ((i=1; i<=$#; i++)); do
  if [[ "${!i}" == "--version" && $((i+1)) -le $# ]]; then
    j=$((i+1)); VERSION="${!j}"
  fi
done

if [[ -z "$VERSION" ]]; then
  VERSION="v$(date +%Y.%m.%d)-$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo nogit)"
fi

BUYER_IDS="$(python3 - "$REGISTRY" <<'PYEOF'
import json, sys
reg = json.load(open(sys.argv[1]))
for b in reg["buyers"]:
    print(b["id"])
PYEOF
)"
COUNT="$(echo "$BUYER_IDS" | grep -c . || true)"

echo "=============================================="
echo " SafarDesk rollout — ALL buyers"
echo " Buyers:  $COUNT"
echo " Version: $VERSION"
echo " Rules:   $([[ "$DEPLOY_RULES" == "1" ]] && echo "yes (firestore:rules)" || echo "per-buyer registry setting")"
echo " Data:    NEVER touched (hosting + rules only)"
echo "=============================================="

if [[ "$ASSUME_YES" != "1" && "$DRY_RUN" != "1" ]]; then
  echo "This will deploy version $VERSION to $COUNT buyer(s)."
  read -r -p "Continue? [y/N] " ans
  [[ "$ans" == "y" || "$ans" == "Y" ]] || { echo "Cancelled."; exit 0; }
fi

cd "$REPO_ROOT"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "[dry-run] would build once: npm run build"
  echo "[dry-run] would git tag: $VERSION"
  for id in $BUYER_IDS; do echo "[dry-run] would deploy buyer: $id"; done
  exit 0
fi

echo "--- Building ONCE (same bundle for every buyer) ---"
npm run build

echo "--- Tagging release $VERSION ---"
git tag -a "$VERSION" -m "SafarDesk release $VERSION (all-buyers rollout)" 2>/dev/null || echo "(tag $VERSION already exists — continuing)"

OK_LIST=""
FAIL_LIST=""
for id in $BUYER_IDS; do
  echo ""
  echo ">>> Buyer: $id"
  ARGS=( "$id" "--version" "$VERSION" "--yes" "--skip-build" )
  [[ "$DEPLOY_RULES" == "1" ]] && ARGS+=( "--rules" )
  if "$SCRIPT_DIR/deploy-buyer.sh" "${ARGS[@]}"; then
    OK_LIST="$OK_LIST $id"
  else
    FAIL_LIST="$FAIL_LIST $id"
  fi
done

echo ""
echo "=============================================="
echo " Rollout summary — $VERSION"
echo " Succeeded ($(echo "$OK_LIST" | wc -w)): $OK_LIST"
if [[ -n "$FAIL_LIST" ]]; then
  echo " FAILED ($(echo "$FAIL_LIST" | wc -w)):$FAIL_LIST"
  echo " Re-run failed buyers individually:"
  for id in $FAIL_LIST; do echo "   ./deploy/deploy-buyer.sh $id --version $VERSION"; done
  exit 1
fi
echo " All $COUNT buyer(s) updated. No data touched."
echo "=============================================="
