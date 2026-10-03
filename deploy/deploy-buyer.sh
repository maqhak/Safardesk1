#!/usr/bin/env bash
#
# deploy-buyer.sh — Deploy ONE SafarDesk build to a single buyer's Firebase Hosting.
#
# Usage:
#   ./deploy/deploy-buyer.sh <buyer-id> [--version v1.2.0] [--rules] [--dry-run] [--yes]
#
# What it deploys (and ONLY this):
#   - Firebase Hosting  (--only hosting)   -> the compiled frontend (dist/)
#   - Firestore rules   (--only firestore:rules, only with --rules)
#
# What it NEVER touches:
#   - Firestore DATA (documents/collections) — no read, no write, no delete.
#     Buyer data cannot be lost by this script, by design.
#
# New features / new collections ship via the new build (+ rules with --rules).
# Old documents keep working because the app reads new fields with fallbacks.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REGISTRY="$SCRIPT_DIR/buyers.registry.json"
LOG="$SCRIPT_DIR/releases.log"

BUYER_ID="${1:-}"
VERSION=""
DEPLOY_RULES=0
DRY_RUN=0
ASSUME_YES=0
SKIP_BUILD=0

for arg in "${@:2}"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --version=*) VERSION="${arg#*=}" ;;
    --version) ;;
    --rules) DEPLOY_RULES=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --yes) ASSUME_YES=1 ;;
    v*) VERSION="$arg" ;; # allow bare "v1.2.0" as second arg
    *)
      # SAFETY GUARD: refuse anything that looks destructive
      if [[ "$arg" =~ (delete|destroy|purge|wipe|firestore:delete) ]]; then
        echo "ABORTED: destructive argument '$arg' is never allowed in deploy scripts." >&2
        exit 1
      fi
      ;;
  esac
done
# support "--version v1.2.0" (space separated)
for ((i=2; i<=$#; i++)); do
  if [[ "${!i}" == "--version" && $((i+1)) -le $# ]]; then
    j=$((i+1)); VERSION="${!j}"
  fi
done

if [[ -z "$BUYER_ID" ]]; then
  echo "Usage: ./deploy/deploy-buyer.sh <buyer-id> [--version v1.2.0] [--rules] [--dry-run] [--yes]" >&2
  exit 1
fi

if [[ -z "$VERSION" ]]; then
  VERSION="v$(date +%Y.%m.%d)-$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo nogit)"
fi

# Read buyer from registry (python3, no jq dependency)
BUYER_JSON="$(python3 - "$REGISTRY" "$BUYER_ID" <<'PYEOF'
import json, sys
reg = json.load(open(sys.argv[1]))
b = next((x for x in reg["buyers"] if x["id"] == sys.argv[2]), None)
if not b:
    print("NOT_FOUND"); sys.exit(0)
print(json.dumps(b))
PYEOF
)"
if [[ "$BUYER_JSON" == "NOT_FOUND" ]]; then
  echo "Buyer '$BUYER_ID' not found in buyers.registry.json" >&2
  exit 1
fi

PROJECT_ID="$(python3 -c "import json,sys; print(json.load(sys.stdin)['firebaseProjectId'])" <<< "$BUYER_JSON")"
COMPANY="$(python3 -c "import json,sys; print(json.load(sys.stdin)['companyName'])" <<< "$BUYER_JSON")"
REGISTRY_RULES="$(python3 -c "import json,sys; print('yes' if json.load(sys.stdin).get('deployFirestoreRules') else 'no')" <<< "$BUYER_JSON")"

TARGETS="hosting"
if [[ "$DEPLOY_RULES" == "1" || "$REGISTRY_RULES" == "yes" ]]; then
  TARGETS="hosting,firestore:rules"
fi

echo "=============================================="
echo " SafarDesk deploy — single buyer"
echo " Buyer:   $COMPANY ($BUYER_ID)"
echo " Project: $PROJECT_ID"
echo " Version: $VERSION"
echo " Targets: $TARGETS   (data is NEVER touched)"
echo "=============================================="

if [[ "$ASSUME_YES" != "1" && "$DRY_RUN" != "1" ]]; then
  read -r -p "Deploy? [y/N] " ans
  [[ "$ans" == "y" || "$ans" == "Y" ]] || { echo "Cancelled."; exit 0; }
fi

cd "$REPO_ROOT"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "[dry-run] would build: npm run build"
  echo "[dry-run] would run:  firebase deploy --only $TARGETS --project $PROJECT_ID"
  exit 0
fi

echo "--- Building production bundle (BrowserRouter, no demo mode) ---"
if [[ "$SKIP_BUILD" != "1" ]]; then
  npm run build
else
  echo "(build skipped — reusing dist/ from the rollout build)"
fi

echo "--- Deploying to Firebase project: $PROJECT_ID ---"
if firebase deploy --only "$TARGETS" --project "$PROJECT_ID"; then
  STATUS="OK"
  echo "DEPLOY OK: $COMPANY ($PROJECT_ID) version $VERSION"
else
  STATUS="FAILED"
  echo "DEPLOY FAILED: $COMPANY ($PROJECT_ID) version $VERSION" >&2
fi

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "$TS | $VERSION | single | $BUYER_ID | $COMPANY | $PROJECT_ID | targets=$TARGETS | $STATUS" >> "$LOG"

[[ "$STATUS" == "OK" ]]
