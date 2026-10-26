const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');
const { copyFileSync, existsSync, mkdirSync, writeFileSync } = require('node:fs');
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

      // Le certificat n'est pas versionné (*.pem est ignoré par git). Sans lui, le prébuild ne doit pas
      // échouer : le développement local (émulateur, API en clair sur le poste) n'en a pas besoin. Seule
      // la connexion à l'API de production (domaine cecaw.cm) exige cette ancre : un build de production
      // doit donc être fait avec le fichier présent.
      const source = join(cfg.modRequest.projectRoot, 'assets/certs', FICHIER_CERT);
      const certificatPresent = existsSync(source);
      if (certificatPresent) copyFileSync(source, join(dossierBrut, 'cecaw_origin_ca.pem'));
      else console.warn(`[cecaw] assets/certs/${FICHIER_CERT} absent : ancre de confiance non ajoutée (l'API de production ne sera pas joignable depuis ce build).`);

      // `cleartextTrafficPermitted="false"` : aucune requete en clair, meme par
      // erreur de configuration. Tout passe par TLS.
      writeFileSync(
        join(dossierXml, `${NOM_CONFIG}.xml`),
        `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">${DOMAINE}</domain>
        <trust-anchors>
${certificatPresent ? '            <certificates src="@raw/cecaw_origin_ca" />\n' : ''}            <certificates src="system" />
        </trust-anchors>
    </domain-config>
    <!-- Développement local uniquement : poste relié par câble (adb reverse) ou émulateur. Ces adresses ne
         désignent que l'appareil lui-même ou son hôte de développement, jamais un serveur distant. -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">10.0.2.2</domain>
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
