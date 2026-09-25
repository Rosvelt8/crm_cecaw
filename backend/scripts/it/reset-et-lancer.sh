#!/usr/bin/env bash
# Réinitialise la base de TEST (localhost:5544), la remplit avec le seed, puis lance un script d'intégration.
# Usage : scripts/it/reset-et-lancer.sh 01-credit   (ou 02-terrain, 03-transverse)
set -e
cd "$(dirname "$0")/../.."
export DATABASE_URL="postgresql://cecaw:test@localhost:5544/cecaw_test" JOBS_ENABLED=false NODE_ENV=production
export DATA_ENCRYPTION_KEY="$(node -e "console.log('ab'.repeat(32))")"
export UPLOAD_DIR="${IT_UPLOAD_DIR:-./.it-uploads}"
npx prisma db push --force-reset --skip-generate --accept-data-loss > /dev/null 2>&1
npx ts-node --transpile-only prisma/seed.ts > /dev/null 2>&1
npx ts-node --transpile-only "scripts/it/$1.ts" 2>&1 | grep -E "^(  OK|  KO|==|[0-9]+ vérif)|rror|    at " 
