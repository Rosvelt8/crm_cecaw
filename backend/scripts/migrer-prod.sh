#!/usr/bin/env bash
# Migration prudente du schéma de production (sans garantie automatique d'absence de perte).
#
# Le projet n'a pas d'historique de migrations (`prisma db push`) : on ne peut donc pas savoir à
# l'avance dans quel état est la base de production. Ce script compare la base RÉELLE (DATABASE_URL)
# au schéma du code, et n'applique que la différence, après contrôle.
#
#   1. Génération du SQL exact, sans toucher à la base.
#   2. Refus des suppressions de tables/colonnes/types et opérations de suppression de lignes.
#   3. Sauvegarde chiffrée, sauf --sans-sauvegarde.
#   4. Confirmation (taper MIGRER), sauf --oui.
#   5. Application en une transaction PostgreSQL.
#   6. Vérification de conformité du schéma.
#
# Usage (sur le serveur, dans backend/, application arrêtée et en maintenance) :
#   DATABASE_URL=postgresql://... DATA_ENCRYPTION_KEY=... bash scripts/migrer-prod.sh
#   Options : --apercu (génère le SQL et s'arrête), --oui (sans confirmation),
#             --sans-sauvegarde (déconseillé; incompatible avec --oui)
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DATABASE_URL:?Renseigner DATABASE_URL (base de production)}"
OUI=0; SANS_SAUVEGARDE=0; APERCU=0
for a in "$@"; do
  case "$a" in
    --oui) OUI=1 ;;
    --sans-sauvegarde) SANS_SAUVEGARDE=1 ;;
    --apercu) APERCU=1 ;;
    *) echo "Option inconnue : $a" >&2; exit 1 ;;
  esac
done

if [ "$OUI" = 1 ] && [ "$SANS_SAUVEGARDE" = 1 ]; then
  echo "Refus : --oui et --sans-sauvegarde ne peuvent pas être combinés." >&2
  exit 1
fi

if ! command -v flock >/dev/null 2>&1; then
  echo "Commande flock introuvable (installez util-linux) : impossible d'empêcher deux migrations simultanées." >&2
  exit 1
fi

umask 077
mkdir -p migrations-prod
exec 9>migrations-prod/.migrer-prod.lock
if ! flock -n 9; then
  echo "Une autre migration est déjà en cours (verrou migrations-prod/.migrer-prod.lock)." >&2
  exit 1
fi

HORODATAGE="$(date +%Y%m%d-%H%M%S)-$$"
SQL="migrations-prod/migration-$HORODATAGE.sql"
SQL_TEMP="$SQL.tmp"
TRANSACTION="migrations-prod/migration-$HORODATAGE.transaction.sql"
trap 'rm -f "$SQL_TEMP" "$TRANSACTION.tmp"' EXIT

echo "== 1/6 Génération du SQL à appliquer (base réelle -> schéma du code)"
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > "$SQL_TEMP"
if ! grep -qvE '^[[:space:]]*(--.*)?$' "$SQL_TEMP"; then
  echo "La base est déjà à jour : rien à appliquer."; rm -f "$SQL"; exit 0
fi
mv "$SQL_TEMP" "$SQL"
echo "SQL enregistré dans $SQL :"
echo "------------------------------------------------------------"
cat "$SQL"
echo "------------------------------------------------------------"

echo "== 2/6 Contrôle préliminaire des opérations destructives"
DESTRUCTEUR=$(grep -inE '^[[:space:]]*(DROP[[:space:]]+(TABLE|COLUMN|TYPE|SCHEMA|DATABASE)|TRUNCATE([[:space:]]|;)|DELETE[[:space:]]+FROM)|^[[:space:]]*ALTER[[:space:]]+TABLE.*DROP[[:space:]]+COLUMN' "$SQL" || true)
if [ -n "$DESTRUCTEUR" ]; then
  echo "REFUS : le contrôle a détecté des opérations potentiellement destructives :" >&2
  echo "$DESTRUCTEUR" >&2
  echo "Rien n'a été modifié. Examiner $SQL et traiter ces changements explicitement." >&2
  exit 2
fi
A_RELIRE=$(grep -inE 'ALTER[[:space:]]+COLUMN.*TYPE|SET[[:space:]]+NOT[[:space:]]+NULL|RENAME|DROP[[:space:]]+CONSTRAINT|ALTER[[:space:]]+TYPE' "$SQL" || true)
if [ -n "$A_RELIRE" ]; then
  echo "À relire attentivement (le contrôle textuel ne garantit pas l'absence de perte de données) :"
  echo "$A_RELIRE"
fi
echo "Aucune opération bloquée détectée. Ce contrôle textuel n'est pas une preuve d'innocuité."

if [ "$APERCU" = 1 ]; then echo "Mode aperçu : arrêt avant toute modification."; exit 0; fi

if [ "$SANS_SAUVEGARDE" != 1 ]; then
  : "${DATA_ENCRYPTION_KEY:?DATA_ENCRYPTION_KEY est requise pour créer une sauvegarde chiffrée.}"
  if ! [[ "$DATA_ENCRYPTION_KEY" =~ ^[0-9a-fA-F]{64}$ ]]; then
    echo "DATA_ENCRYPTION_KEY doit contenir exactement 64 caractères hexadécimaux." >&2
    exit 1
  fi
fi

echo "== 3/6 Génération du client Prisma"
npx prisma generate

echo "== 4/6 Sauvegarde"
if [ "$SANS_SAUVEGARDE" = 1 ]; then
  echo "Sauvegarde ignorée (--sans-sauvegarde)."
else
  BACKUP_ENCRYPT=true npm run db:backup
fi

if [ "$OUI" != 1 ]; then
  read -r -p "== 5/6 Confirmez que l'application est arrêtée et tapez MIGRER pour appliquer en production : " REPONSE
  [ "$REPONSE" = "MIGRER" ] || { echo "Annulé, rien n'a été modifié."; exit 1; }
fi

echo "== 6/6 Application (transaction unique)"
{ echo "BEGIN;"; cat "$SQL"; echo "COMMIT;"; } > "$TRANSACTION.tmp"
mv "$TRANSACTION.tmp" "$TRANSACTION"
npx prisma db execute --url "$DATABASE_URL" --file "$TRANSACTION"

echo "Vérification : la base doit maintenant correspondre au schéma"
set +e
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code > /dev/null
CODE=$?
set -e
if [ "$CODE" != 0 ]; then
  echo "La transaction est appliquée, mais la vérification a échoué (code $CODE)." >&2
  echo "Ne redémarrez pas l'application avant d'avoir diagnostiqué l'écart avec le schéma." >&2
  exit 3
fi
echo "Migration appliquée, base conforme au schéma. Consultez docs/MISE_EN_PRODUCTION.md."
