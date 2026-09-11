const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');
const { copyFileSync, existsSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

/**
 * Signe l'APK de production avec une cle stable.
 *
 * Par defaut, Expo signe le build « release » avec la cle de debogage. Android
 * refuse d'installer une mise a jour signee par une cle differente de celle de
 * la version en place : sans cle stable, chaque nouvelle version obligerait les
 * agents a desinstaller puis reinstaller, en perdant leur session.
 *
 * La cle et son mot de passe vivent dans `credentials/`, hors du depot. En leur
 * absence le plugin ne fait rien et le build retombe sur la cle de debogage,
 * ce qui laisse un poste sans les secrets produire un APK de test.
 */
const DOSSIER = 'credentials';
const PROPRIETES = 'keystore.properties';

function lireProprietes(projectRoot) {
  const chemin = join(projectRoot, DOSSIER, PROPRIETES);
  if (!existsSync(chemin)) return null;

  const valeurs = {};
  for (const ligne of readFileSync(chemin, 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/.exec(ligne);
    if (m) valeurs[m[1]] = m[2];
  }
  return valeurs.CECAW_STORE_FILE ? valeurs : null;
}

/** Copie le magasin de cles dans le projet natif, qui est regenerable. */
function withKeystore(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      // `expo prebuild` recree le dossier android/ et efface local.properties,
      // sans lequel Gradle ne trouve plus le SDK. On le repose a chaque fois.
      const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
      if (sdk) {
        writeFileSync(
          join(cfg.modRequest.platformProjectRoot, 'local.properties'),
          // Barres obliques : dans un fichier .properties Java, l'antislash est
          // un caractere d'echappement et corromprait le chemin.
          `sdk.dir=${sdk.replace(/\\/g, '/')}\n`,
          'utf8',
        );
      }

      const props = lireProprietes(cfg.modRequest.projectRoot);
      if (!props) {
        console.warn(
          `[signature] ${DOSSIER}/${PROPRIETES} absent : l'APK sera signe avec la cle de debogage.`,
        );
        return cfg;
      }
      copyFileSync(
        join(cfg.modRequest.projectRoot, DOSSIER, props.CECAW_STORE_FILE),
        join(cfg.modRequest.platformProjectRoot, 'app', props.CECAW_STORE_FILE),
      );
      return cfg;
    },
  ]);
}

/** Declare la configuration de signature et l'applique au type « release ». */
function withGradle(config) {
  return withAppBuildGradle(config, (cfg) => {
    const props = lireProprietes(cfg.modRequest.projectRoot);
    if (!props || cfg.modResults.contents.includes('cecawRelease')) return cfg;

    cfg.modResults.contents = cfg.modResults.contents
      .replace(
        /(signingConfigs \{)/,
        `$1
        cecawRelease {
            storeFile file('${props.CECAW_STORE_FILE}')
            storePassword '${props.CECAW_STORE_PASSWORD}'
            keyAlias '${props.CECAW_KEY_ALIAS}'
            keyPassword '${props.CECAW_KEY_PASSWORD}'
        }`,
      )
      .replace(
        /(release \{\n(?:\s*\/\/[^\n]*\n)*)\s*signingConfig signingConfigs\.debug/,
        '$1            signingConfig signingConfigs.cecawRelease',
      );

    return cfg;
  });
}

module.exports = (config) => withGradle(withKeystore(config));
