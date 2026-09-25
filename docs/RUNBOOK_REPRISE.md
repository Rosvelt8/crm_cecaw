# Plan de reprise d'activité (PRA) - CECAW Finance 360

## Objectifs (à valider par la direction)
- RPO (perte de données tolérée) : 24 h, une sauvegarde chiffrée quotidienne est planifiée (tâche automatique, verrouillée pour n'avoir qu'une exécution par jour même avec plusieurs instances).
- RTO (durée maximale de reprise) : 4 h avec un serveur de remplacement prêt.
Ces valeurs sont des hypothèses de départ, pas un engagement mesuré. Pour un RPO plus court, planifier `npm run db:backup` plus souvent.

## Ce qui est sauvegardé
- Base PostgreSQL complète (pg_dump format custom), chiffrée en AES-256-GCM par flux, avec manifeste JSON et empreinte SHA-256. Dossier : `BACKUP_DIR` (défaut `backend/backups`). Rétention : paramètre `securite.retention_sauvegardes_jours` (la plus récente est toujours conservée).
- NON couvert par la sauvegarde base : le dossier `UPLOAD_DIR` (photos, pièces, signatures, archives). Le copier séparément (rsync ou snapshot du volume).

## Prérequis
- Outils client PostgreSQL (`pg_dump`, `pg_restore`) installés sur le serveur, ou `PG_DUMP_PATH` / `PG_RESTORE_PATH`.
- `DATA_ENCRYPTION_KEY` (64 caractères hexadécimaux) : sert au chiffrement des sauvegardes ET des secrets MFA en base.

## Garde de la clé
- Conserver la clé hors du serveur (coffre de mots de passe de la direction, copie papier scellée chez un second responsable).
- Sans la clé, les sauvegardes sont irrécupérables. Une clé perdue n'a pas de remède.
- Changer la clé rend illisibles les anciennes sauvegardes et les secrets MFA existants : conserver l'ancienne clé tant que des sauvegardes l'utilisent.

## Sauvegarde manuelle
```
cd backend
npm run db:backup
```
Contrôle d'intégrité : l'écran Administration > Sauvegardes (ou l'API) recalcule les empreintes.

## Restauration
1. Installer le code, renseigner `.env` (DATABASE_URL de la base cible, DATA_ENCRYPTION_KEY d'origine).
2. Créer une base vide si le serveur est neuf.
3. `npm run db:restore` liste les sauvegardes, puis `npm run db:restore -- cecaw-AAAAMMJJ-HHMMSS.dump.enc`. Taper RESTAURER pour confirmer (`--oui` pour un script). L'empreinte est vérifiée avant toute modification : une sauvegarde altérée est refusée.
4. Restaurer `UPLOAD_DIR` depuis sa copie.
5. `npm run build` puis redémarrer (`pm2 restart cecaw-backend`).
6. Contrôles : connexion d'un administrateur, nombre de clients et de crédits, dernier reçu de collecte, balance comptable équilibrée, journal d'audit.

## Exercice
Répéter la restauration sur un serveur de test au moins une fois par trimestre et consigner la durée réelle pour mesurer le RTO.

## Après incident
- Les opérations terrain faites hors ligne se rejouent d'elles-mêmes à la reconnexion des mobiles (identifiants d'idempotence : pas de doublon).
- Vérifier le journal des échanges (SMS, webhooks, comptabilité) pour renvoyer ce qui est resté en échec.
