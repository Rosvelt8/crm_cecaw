#!/usr/bin/env node
/**
 * Retablit les redirections USB avant chaque `npm start`.
 *
 * Le fichier .env pointe sur `http://localhost:4000` : cote telephone, cela ne
 * mene au poste que si `adb reverse` est actif. Or ces redirections sont
 * perdues a chaque debranchement du cable, redemarrage du telephone ou
 * relance du demon adb, et l'application se contente alors d'une erreur reseau.
 *
 * Le script ne bloque jamais le demarrage : sans appareil branche (Wi-Fi,
 * emulateur, simple travail sur le code), il se contente d'un avertissement.
 */
const { existsSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');

const PORTS = [
  [4000, 'backend'],
  [8090, 'Metro'],
];

/** adb est rarement dans le PATH sous Windows : on le cherche aux emplacements usuels. */
function findAdb() {
  const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const roots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
    process.env.HOME && join(process.env.HOME, 'Android', 'Sdk'),
    process.env.HOME && join(process.env.HOME, 'Library', 'Android', 'sdk'),
  ].filter(Boolean);

  for (const root of roots) {
    const candidate = join(root, 'platform-tools', exe);
    if (existsSync(candidate)) return candidate;
  }

  // Dernier recours : peut-etre bien dans le PATH.
  const probe = spawnSync(exe, ['version'], { stdio: 'ignore' });
  return probe.error ? null : exe;
}

function main() {
  const adb = findAdb();
  if (!adb) {
    console.warn('[adb-reverse] adb introuvable, redirections ignorees.');
    return;
  }

  const devices = spawnSync(adb, ['devices'], { encoding: 'utf8' });
  const connected = (devices.stdout || '')
    .split('\n')
    .slice(1)
    .filter((l) => l.trim().endsWith('device')).length;

  if (connected === 0) {
    console.warn('[adb-reverse] aucun appareil branche, redirections ignorees.');
    return;
  }

  for (const [port, label] of PORTS) {
    const r = spawnSync(adb, ['reverse', `tcp:${port}`, `tcp:${port}`], { encoding: 'utf8' });
    const ok = r.status === 0;
    console.log(`[adb-reverse] ${label} ${port} ${ok ? 'OK' : 'ECHEC'}`);
  }
}

main();
