#!/bin/bash
# SafarDesk — One-Build-Many-Tenants deploy (Phone/Termux version)
# Usage: bash deploy-phone.sh
set -e

echo "=== Building ONCE ==="
npm run build
if [ $? -ne 0 ]; then
  echo "BUILD FAILED"
  exit 1
fi

projects=(
  'safardesk-abusultan'
  'safardesk-adan-travels'
  'safardesk-leading-travels-01'
  'safardesk-6brothers'
  'fs-travel-n-tours'
  'safardesk-ub-travels'
  'safardesk-skyship-travels'
)

for p in "${projects[@]}"; do
  echo ""
  echo "=== Deploying to $p ==="
  firebase deploy --only hosting --project "$p"
done

echo ""
echo "=== All deployed! ==="
