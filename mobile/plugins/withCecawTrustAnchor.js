const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');
const { copyFileSync, mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

/**
 * Fait accepter par Android le certificat du serveur CECAW.
 *
 * L'API de production presente un « Cloudflare Origin Certificate ». Ce type de
 * certificat n'est reconnu que par Cloudflare : aucun magasin de confiance
 * public ne le valide, et Android refuse donc la connexion, ce qui rendrait
 * l'application inutilisable.
 *
 * On ajoute la racine correspondante comme ancre de confiance supplementaire,
 * limitee au seul domaine cecaw.cm. Les autorites du systeme restent actives :
 * le jour ou le serveur passera a un certificat publiquement reconnu
 * (Let's Encrypt par exemple), l'application continuera de fonctionner et ce
 * plugin pourra simplement etre retire.
 *
 * Un plugin plutot qu'une edition directe de `android/` : ces fichiers sont
 * regeneres a chaque `expo prebuild`, la modification serait perdue.
 */

const DOMAINE = 'cecaw.cm';
const FICHIER_CERT = 'cloudflare-origin-ca.pem';
const NOM_CONFIG = 'network_security_config';

/** Depose le certificat et la configuration reseau dans les ressources Android. */
function withFichiers(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const res = join(cfg.modRequest.platformProjectRoot, 'app/src/main/res');
      const dossierBrut = join(res, 'raw');
      const dossierXml = join(res, 'xml');
      mkdirSync(dossierBrut, { recursive: true });
      mkdirSync(dossierXml, { recursive: true });

      copyFileSync(
        join(cfg.modRequest.projectRoot, 'assets/certs', FICHIER_CERT),
        join(dossierBrut, 'cecaw_origin_ca.pem'),
      );

      // `cleartextTrafficPermitted="false"` : aucune requete en clair, meme par
      // erreur de configuration. Tout passe par TLS.
      writeFileSync(
        join(dossierXml, `${NOM_CONFIG}.xml`),
        `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">${DOMAINE}</domain>
        <trust-anchors>
            <certificates src="@raw/cecaw_origin_ca" />
            <certificates src="system" />
        </trust-anchors>
    </domain-config>
</network-security-config>
`,
        'utf8',
      );

      return cfg;
    },
  ]);
}

/** Declare la configuration dans le manifeste. */
function withManifeste(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    application.$['android:networkSecurityConfig'] = `@xml/${NOM_CONFIG}`;
    return cfg;
  });
}

module.exports = (config) => withManifeste(withFichiers(config));
