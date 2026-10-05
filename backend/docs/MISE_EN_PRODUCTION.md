# Mise à jour du schéma en production

Le dépôt n'a pas d'historique de migrations Prisma. Pour une base qui contient déjà des données,
utilisez `scripts/migrer-prod.sh` au lieu de relancer `prisma db push`. Réservez `db push` à une
première initialisation sur une base neuve et vide.

## Procédure

Exécutez ces commandes sur le serveur, depuis `backend/`. Avant de migrer, déployez le code et
construisez l'application :

```bash
git pull
npm install
npm run build
```

Chargez les variables nécessaires depuis le gestionnaire de secrets du serveur, puis générez et
examinez l'aperçu. Un fichier `.env` Node n'est pas nécessairement un fichier shell : ne le sourcez
pas aveuglément. Ces lectures masquent les valeurs pendant la saisie :

```bash
read -r -s -p 'DATABASE_URL: ' DATABASE_URL; printf '\n'; export DATABASE_URL
bash scripts/migrer-prod.sh --apercu
```

Pour la migration, saisissez aussi la clé qui chiffre la sauvegarde :

Lisez tout le SQL affiché et conservé dans `migrations-prod/`. Le filtre du script bloque plusieurs
opérations destructives courantes, mais c'est un contrôle textuel : il ne prouve pas que le SQL est
sans perte de données. Évaluez les changements de type, contraintes, valeurs par défaut, renommages
et toute autre modification du schéma selon les données réelles.

Quand le SQL est validé, mettez l'application en maintenance. Arrêtez le backend et tout worker qui
peut écrire dans la base, puis lancez la migration :

```bash
pm2 stop cecaw-backend
read -r -s -p 'DATA_ENCRYPTION_KEY: ' DATA_ENCRYPTION_KEY; printf '\n'; export DATA_ENCRYPTION_KEY
bash scripts/migrer-prod.sh
```

Par défaut, le script exige une sauvegarde chiffrée avant l'application : `DATA_ENCRYPTION_KEY`
doit contenir 64 caractères hexadécimaux et la clé doit être conservée hors du serveur. Le script
refuse également les principales opérations SQL détectées comme destructives. Les fichiers SQL
générés sont conservés avec des permissions restreintes dans `migrations-prod/`, dossier ignoré
par Git.

Après l'application, le script vérifie que la base correspond au schéma Prisma. En cas d'échec de
cette vérification, la transaction est déjà validée : ne redémarrez pas l'application avant
d'avoir diagnostiqué l'écart. Consultez le [runbook de reprise](../../docs/RUNBOOK_REPRISE.md).
Après succès, redémarrez et contrôlez le backend :

```bash
pm2 restart cecaw-backend
pm2 status
curl http://localhost:4000/api/v1/auth/me
```

## Options

- `--apercu` : affiche et enregistre le SQL, puis s'arrête avant toute modification.
- `--oui` : saute la confirmation interactive. N'utilisez cette option que si l'application a déjà
  été arrêtée et que la mise en maintenance est confirmée.
- `--sans-sauvegarde` : saute la sauvegarde ; option déconseillée et incompatible avec `--oui`.

Ne lancez pas automatiquement `prisma db:seed` à chaque déploiement. Exécutez-le uniquement si la
version déployée requiert de nouvelles données de référence et après avoir vérifié son effet.
