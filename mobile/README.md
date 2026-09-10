# Cecaw Terrain — application mobile

Application Expo (React Native) **réservée aux agents de collecte**. Tout compte
dont le rôle n'est pas `agent` est refusé à la connexion.

## Démarrer

```bash
cd mobile
npm install
cp .env.example .env      # puis ajuster EXPO_PUBLIC_API_URL
npm start                 # équivaut à : expo start --port 8090
```

### Pourquoi le port 8090 et pas 8081

Sur ce poste, **Docker occupe déjà le port 8081 sur toutes les interfaces**
(`0.0.0.0:8081`, il relaie un conteneur). Metro ne peut donc pas s'y lier, et le
téléphone qui appelle `http://<IP-du-poste>:8081` tombe sur Docker, qui répond
`403`. Expo Go tourne quelques secondes puis abandonne, sans message clair.

Vérifier qui tient le port :

```bash
netstat -ano | grep LISTENING | grep :8081
```

Le script `npm start` fixe donc le port 8090. Si celui-ci venait à être pris à
son tour, n'importe quel port libre convient : `npx expo start --port 8095`.

Le téléphone et le poste doivent être sur **le même réseau Wi-Fi**, et le
pare-feu Windows autoriser le port choisi. En cas de blocage réseau persistant,
`npx expo start --tunnel` contourne le problème.

### Le téléphone ne voit pas le backend

Symptôme : l'application se lance mais aucune donnée n'arrive, ou « Pas de
connexion ».

Le `.env` pointe sur `http://localhost:4000`. Côté téléphone, `localhost`
désigne le téléphone lui-même : cela ne mène au poste que grâce à
`adb reverse`. **Ces redirections sont perdues à chaque débranchement du câble,
redémarrage du téléphone ou relance du démon adb.**

`npm start` et `npm run android` les rétablissent désormais automatiquement
(`scripts/adb-reverse.js`). Pour les remettre sans relancer Metro :

```bash
npm run adb:link
```

Vérifier depuis le téléphone lui-même :

```bash
adb shell 'nc -z localhost 4000; echo $?'   # 0 = le poste est joignable
```

Le script n'échoue jamais le démarrage : sans appareil branché, il avertit et
laisse Metro démarrer.

### Adresse du backend

L'application **deduit l'adresse du backend de celle de Metro**
(`src/config.ts`) : meme hote, port 4000. Elle suit donc automatiquement les
changements d'IP du poste, et fonctionne indifferemment par cable ou en Wi-Fi.

| Contexte | `hostUri` de Metro | Adresse deduite |
|---|---|---|
| Wi-Fi | `192.168.1.9:8090` | `http://192.168.1.9:4000/api/v1` |
| Cable (adb reverse) | `localhost:8090` | `http://localhost:4000/api/v1` |
| Emulateur | `10.0.2.2:8090` | `http://10.0.2.2:4000/api/v1` |

`EXPO_PUBLIC_API_URL` ne sert que de **repli**, quand Metro n'est pas joignable :
version installee lancee seule, ou build de production.

`EXPO_PUBLIC_API_URL` doit pointer vers le backend :

| Contexte | Valeur |
|---|---|
| Émulateur Android | `http://10.0.2.2:4000/api/v1` |
| Simulateur iOS | `http://localhost:4000/api/v1` |
| Téléphone réel | `http://<IP-LAN-du-poste>:4000/api/v1` |

Sur téléphone réel, le backend doit écouter sur l'interface réseau (pas
uniquement `localhost`) et le pare-feu autoriser le port 4000.

## Identité visuelle

Reprise du back-office pour que les deux outils se ressemblent :

- **Couleur de marque** : or foncé `#B8860B`, avec l'échelle complète copiée de
  `frontend/tailwind.config.ts`. Elle porte les actions principales ; les statuts
  gardent le vert / ambre / rouge universels.
- **Fond sombre** `#2d1e03` (brand 950) pour les bandeaux d'identité, l'écran de
  lancement, le verrouillage et le montant de collecte.
- **Polices** : Poppins (texte), Playfair Display (nom de marque), JetBrains Mono
  (matricules, numéros de compte, montants). Les trois viennent du web.
- **Logo** : `assets/logo.png`, copie de `frontend/public/logo.png`.

Les jetons vivent dans `src/theme.ts` (`colors`, `fonts`, `spacing`, `radius`,
`shadow`), et les composants partagés dans `src/components/ui.tsx`.

> Les polices sont importées **par graisse**
> (`@expo-google-fonts/poppins/400Regular`), jamais depuis l'index du paquet :
> celui-ci réexporte les 18 variantes, qui finiraient toutes dans l'APK. Même
> raison pour `@expo/vector-icons/Feather` plutôt que l'index, qui embarque les
> 20 polices d'icônes. L'export est passé de 66 à 9 fichiers `.ttf`.

## Sécurité : code PIN et verrouillage

Le mot de passe n'est saisi qu'une fois. Ensuite, l'accès est gardé par un code
PIN à 4 chiffres choisi juste après la première connexion.

- **Le code n'est jamais stocké en clair** : seul `SHA-256(sel + code)` est
  conservé, dans le Keychain (iOS) / Keystore (Android) via `expo-secure-store`.
  Le sel est tiré au hasard, ce qui interdit toute comparaison à une table
  pré-calculée des 10 000 codes possibles.
- **Codes triviaux refusés** : suites et chiffres répétés (`0000`, `1234`).
- **Verrouillage automatique** après le délai choisi par l'agent (1, 2, 5 ou
  15 min), déclenché aussi bien par un retour d'arrière-plan que par une absence
  d'interaction écran allumé.
- **Redemandé à chaque démarrage à froid**, quel que soit le délai.
- **Après 5 échecs, purge complète** : jetons, code, identité, files d'attente et
  suivi GPS sont effacés de l'appareil. C'est la réponse au vol ou à la perte.

Le pavé numérique est un composant maison, pas un `TextInput` : le clavier
système, ses suggestions et son cache ne voient jamais le code.

## Suivi GPS

Actif uniquement **pendant les heures de travail** (`src/config.ts` :
07h–18h, du lundi au samedi) et seulement si l'agent démarre sa tournée.

La tâche `expo-task-manager` tourne hors de React : elle relit à chaque réveil
l'identifiant de la fiche agent depuis le stockage. Hors plage horaire, elle
n'émet rien — même si le système la réveille.

Android impose un service de premier plan visible : l'agent voit en permanence
que sa tournée est en cours.

## Fonctionnement hors ligne

Positions et opérations de collecte sont mises en file quand le réseau manque,
puis rejouées depuis l'onglet **Tournée**. Une transaction n'est retirée de la
file qu'une fois acceptée par le serveur — une collecte encaissée sur le terrain
ne doit jamais disparaître. Les positions sont bornées aux 500 plus récentes.

## Structure

```
app/                    routes expo-router
  _layout.tsx           garde d'accès (Stack.Protected)
  login / pin-setup / pin-unlock
  (tabs)/               tournée, prospects, clients, objectifs
  prospect/nouveau, client/[id], compte/[id]
src/
  api/                  couche HTTP (jeton, refresh, erreurs lisibles)
  lib/                  stockage, PIN, file hors ligne, horaires, formats
  store/session.ts      machine d'états de la session
  tracking/             tâche de fond + pilotage
```

## Vérifications

```bash
npm run typecheck                                  # tsc --noEmit
npx expo-doctor                                    # 21/21
npx expo export --platform android --no-bytecode   # bundle
```

> Sous Windows, `expo export` **sans** `--no-bytecode` peut échouer : le
> compilateur natif Hermes (`hermesc.exe`) plante. Le bundle JavaScript, lui, est
> valide — l'étape bytecode est refaite côté EAS Build.

## Limites d'Expo Go

Expo Go permet de tester l'authentification, le code PIN, les prospects, les
clients, la collecte et les objectifs. En revanche, **le suivi GPS en
arrière-plan n'y fonctionne pas** :

> `expo-task-manager` : « With Expo Go, TaskManager is not available on Android,
> and does not support background execution on iOS. »

L'application le détecte et se dégrade proprement : l'interrupteur de tournée est
désactivé, avec l'explication affichée à l'écran. Le reste fonctionne normalement.

Pour tester le suivi réel, il faut une version installée :

```bash
npx expo install expo-dev-client
npx eas build --profile development --platform android
```

## Restant à faire

- Exécution réelle sur appareil : rien de ce qui suit n'a pu être vérifié
  autrement que par compilation (permissions GPS, tenue du service de fond,
  ergonomie du PIN).
- Restriction au rôle `agent` : appliquée côté application. L'API reste ouverte
  aux autres rôles (le back-office l'utilise), leurs données étant déjà cloisonnées
  par le RBAC serveur.
- Build : `eas build` demande un compte Expo et un `eas.json` non fournis ici.
