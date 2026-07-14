import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD ?? 'Cecaw2025!';

async function main() {
  console.log('🌱 Seeding database...');

  // ── Groupes de produits ───────────────────────────────────────────
  const [gpEpargne, gpAssurance, gpCredit, gpFinancier] = await Promise.all([
    prisma.groupeProduit.upsert({ where: { id: 1 }, create: { nom: 'Épargne', description: 'Produits d\'épargne et dépôts', couleur: '#10b981' }, update: {} }),
    prisma.groupeProduit.upsert({ where: { id: 2 }, create: { nom: 'Micro-assurance', description: 'Couvertures santé et vie', couleur: '#6366f1' }, update: {} }),
    prisma.groupeProduit.upsert({ where: { id: 3 }, create: { nom: 'Crédit', description: 'Produits de financement', couleur: '#f59e0b' }, update: {} }),
    prisma.groupeProduit.upsert({ where: { id: 4 }, create: { nom: 'Produits Financiers', description: 'Services de transfert et mobile banking', couleur: '#3b82f6' }, update: {} }),
  ]);

  // ── Produits ──────────────────────────────────────────────────────
  const produits = [
    { id: 1, nom: 'CECAW Projet', groupeId: gpEpargne.id, description: 'Épargne bloquée pour la réalisation de projets', actif: true },
    { id: 2, nom: 'Dépôts à Terme', groupeId: gpEpargne.id, description: 'Placements à terme avec taux d\'intérêt négocié', actif: true },
    { id: 3, nom: 'Bon de Caisse', groupeId: gpEpargne.id, description: 'Titre de créance nominatif à court ou moyen terme', actif: true },
    { id: 4, nom: 'Collecte Journalière', groupeId: gpEpargne.id, description: 'Épargne mobile de proximité collectée au quotidien', actif: true },
    { id: 5, nom: 'Compte Salaire', groupeId: gpEpargne.id, description: 'Compte dédié à la domiciliation des revenus', actif: true },
    { id: 6, nom: 'Compte Courant', groupeId: gpEpargne.id, description: 'Compte de chèque pour les transactions quotidiennes', actif: true },
    { id: 7, nom: 'Compte Épargne', groupeId: gpEpargne.id, description: 'Compte d\'épargne à vue rémunéré', actif: true },
    { id: 8, nom: 'Prêt Collecte', groupeId: gpCredit.id, description: 'Crédit de trésorerie adossé aux collectes', actif: true },
    { id: 9, nom: 'Escompte Chèque', groupeId: gpCredit.id, description: 'Avance de trésorerie sur chèques', actif: true },
    { id: 10, nom: 'Préfinancement', groupeId: gpCredit.id, description: 'Financement des marchés publics', actif: true },
    { id: 11, nom: 'Crédit Agropastoral', groupeId: gpCredit.id, description: 'Financement des campagnes agricoles', actif: true },
    { id: 12, nom: 'Crédit Équipement', groupeId: gpCredit.id, description: 'Financement pour l\'acquisition de matériel', actif: true },
    { id: 13, nom: 'Crédit Consommation', groupeId: gpCredit.id, description: 'Financement des besoins personnels', actif: true },
    { id: 14, nom: 'CECAW Mobile', groupeId: gpFinancier.id, description: 'Application de banque en ligne', actif: true },
    { id: 15, nom: 'Transferts Internationaux', groupeId: gpFinancier.id, description: 'Réception et envoi de fonds à l\'international', actif: true },
    { id: 16, nom: 'MTN Mobile Money', groupeId: gpFinancier.id, description: 'Passerelle via le réseau MTN', actif: true },
    { id: 17, nom: 'Orange Money', groupeId: gpFinancier.id, description: 'Passerelle via le réseau Orange', actif: true },
    { id: 18, nom: 'PRO28', groupeId: gpAssurance.id, description: 'Contrat de couverture spécifique', actif: true },
    { id: 19, nom: 'CECAW Vie', groupeId: gpAssurance.id, description: 'Assurance décès invalidité et épargne de prévoyance', actif: true },
  ];

  for (const p of produits) {
    await prisma.produit.upsert({ where: { id: p.id }, create: p, update: {} });
  }

  // ── Agences ───────────────────────────────────────────────────────
  const agencesData = [
    { id: 1, nom: 'Agence Dakar', ville: 'Douala', adresse: 'Quartier Dakar', actif: true },
    { id: 2, nom: 'Agence Congo', ville: 'Douala', adresse: 'Marché Congo', actif: true },
    { id: 3, nom: 'Agence Mokolo', ville: 'Yaoundé', adresse: 'Marché Mokolo', actif: true },
    { id: 4, nom: 'Agence Djemoun', ville: 'Foumban', adresse: 'Quartier Djemoun', actif: true },
    { id: 5, nom: 'Agence Bonaberi', ville: 'Douala', adresse: 'Bonaberi, Ancienne Route', actif: true },
    { id: 6, nom: 'Agence Dschang', ville: 'Dschang', adresse: 'Centre-ville, Dschang', actif: true },
    { id: 7, nom: 'Agence Etoudi', ville: 'Yaoundé', adresse: 'Quartier Etoudi', actif: true },
    { id: 8, nom: 'Agence Bepanda', ville: 'Douala', adresse: 'Bepanda Tonnerre', actif: true },
    { id: 9, nom: 'Agence Bonfils', ville: 'Yaoundé', adresse: 'Carrefour Bonfils', actif: true },
    { id: 10, nom: 'Agence Akwa', ville: 'Douala', adresse: 'Marché Congo, Akwa', actif: true },
  ];

  for (const a of agencesData) {
    await prisma.agence.upsert({ where: { id: a.id }, create: a, update: {} });
  }

  // ── Hash mot de passe par défaut ──────────────────────────────────
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  // ── Utilisateur admin ─────────────────────────────────────────────
  const admin = await prisma.utilisateur.upsert({
    where: { email: 'admin@cecaw.cm' },
    create: {
      nom: 'Admin', prenom: 'Système',
      email: 'admin@cecaw.cm', password: hash,
      role: 'admin', fonction: 'Administrateur système',
      agenceId: 1, actif: true,
    },
    update: {},
  });

  // ── Manager exemple ────────────────────────────────────────────────
  const manager = await prisma.utilisateur.upsert({
    where: { email: 'm.ngassa@cecaw.cm' },
    create: {
      nom: 'Ngassa', prenom: 'Marie',
      email: 'm.ngassa@cecaw.cm', password: hash,
      role: 'manager', fonction: 'Responsable agence',
      agenceId: 1, actif: true,
    },
    update: {},
  });

  // ── Agents de base ────────────────────────────────────────────────
  const agentUsers = [
    { nom: 'Mvondo', prenom: 'Jean', email: 'j.mvondo@cecaw.cm', fonction: 'Agent de collecte' },
    { nom: 'Kamga', prenom: 'Eric', email: 'e.kamga@cecaw.cm', fonction: 'Agent terrain' },
    { nom: 'Talla', prenom: 'Pierre', email: 'p.talla@cecaw.cm', fonction: 'Agent de proximité' },
  ];

  const agentUserRecords = [];
  for (const au of agentUsers) {
    const u = await prisma.utilisateur.upsert({
      where: { email: au.email },
      create: { ...au, password: hash, role: 'agent', agenceId: 1, actif: true },
      update: {},
    });
    agentUserRecords.push(u);
  }

  // ── Backoffice ────────────────────────────────────────────────────
  await prisma.utilisateur.upsert({
    where: { email: 'l.bopda@cecaw.cm' },
    create: {
      nom: 'Bopda', prenom: 'Lionel',
      email: 'l.bopda@cecaw.cm', password: hash,
      role: 'backoffice', fonction: 'Caissier principal',
      agenceId: 1, actif: true,
    },
    update: {},
  });

  // ── Équipes spécialisées + effectifs issus de la fiche commerciaux ─
  // (idempotent : si le premier utilisateur de la fiche existe déjà, on saute ce bloc)
  const alreadySeeded = await prisma.utilisateur.findUnique({
    where: { email: 'winniedidine.nanangatchou@cecaw.cm' },
  });

  if (!alreadySeeded) {
    const equipesData: { id: number; nom: string; agenceId: number; responsableRef: number }[] = [
  { id: 1, nom: 'Équipe Crédit Classique Dakar', agenceId: 1, responsableRef: 7 },
  { id: 2, nom: 'Équipe Crédit Collecte Dakar', agenceId: 1, responsableRef: 35 },
  { id: 3, nom: 'Équipe Commerciale Collecte Dakar', agenceId: 1, responsableRef: 14 },
  { id: 4, nom: 'Équipe Bureau Direct Dakar', agenceId: 1, responsableRef: 34 },
  { id: 5, nom: 'Équipe Crédit Classique Congo', agenceId: 2, responsableRef: 38 },
  { id: 6, nom: 'Équipe Crédit Collecte Congo', agenceId: 2, responsableRef: 62 },
  { id: 7, nom: 'Équipe Commerciale Collecte Congo', agenceId: 2, responsableRef: 45 },
  { id: 8, nom: 'Équipe Bureau Direct Congo', agenceId: 2, responsableRef: 62 },
  { id: 9, nom: 'Équipe Crédit Classique Akwa', agenceId: 10, responsableRef: 63 },
  { id: 10, nom: 'Équipe Crédit Collecte Akwa', agenceId: 10, responsableRef: 91 },
  { id: 11, nom: 'Équipe Commerciale Collecte Akwa', agenceId: 10, responsableRef: 72 },
  { id: 12, nom: 'Équipe Bureau Direct Akwa', agenceId: 10, responsableRef: 90 },
  { id: 13, nom: 'Équipe Crédit Classique Mokolo', agenceId: 3, responsableRef: 94 },
  { id: 14, nom: 'Équipe Crédit Collecte Mokolo', agenceId: 3, responsableRef: 120 },
  { id: 15, nom: 'Équipe Commerciale Collecte Mokolo', agenceId: 3, responsableRef: 102 },
  { id: 16, nom: 'Équipe Bureau Direct Mokolo', agenceId: 3, responsableRef: 119 },
  { id: 17, nom: 'Équipe Crédit Classique Djemoun', agenceId: 4, responsableRef: 123 },
  { id: 18, nom: 'Équipe Crédit Collecte Djemoun', agenceId: 4, responsableRef: 154 },
  { id: 19, nom: 'Équipe Commerciale Collecte Djemoun', agenceId: 4, responsableRef: 133 },
  { id: 20, nom: 'Équipe Bureau Direct Djemoun', agenceId: 4, responsableRef: 153 },
  { id: 21, nom: 'Équipe Crédit Classique Bonaberi', agenceId: 5, responsableRef: 156 },
  { id: 22, nom: 'Équipe Crédit Collecte Bonaberi', agenceId: 5, responsableRef: 178 },
  { id: 23, nom: 'Équipe Commerciale Collecte Bonaberi', agenceId: 5, responsableRef: 160 },
  { id: 24, nom: 'Équipe Bureau Direct Bonaberi', agenceId: 5, responsableRef: 177 },
  { id: 25, nom: 'Équipe Crédit Classique Dschang', agenceId: 6, responsableRef: 181 },
  { id: 26, nom: 'Équipe Crédit Collecte Dschang', agenceId: 6, responsableRef: 207 },
  { id: 27, nom: 'Équipe Commerciale Collecte Dschang', agenceId: 6, responsableRef: 189 },
  { id: 28, nom: 'Équipe Bureau Direct Dschang', agenceId: 6, responsableRef: 206 },
  { id: 29, nom: 'Équipe Crédit Classique Etoudi', agenceId: 7, responsableRef: 209 },
  { id: 30, nom: 'Équipe Crédit Collecte Etoudi', agenceId: 7, responsableRef: 231 },
  { id: 31, nom: 'Équipe Commerciale Collecte Etoudi', agenceId: 7, responsableRef: 218 },
  { id: 32, nom: 'Équipe Bureau Direct Etoudi', agenceId: 7, responsableRef: 230 },
    ];

    for (const e of equipesData) {
      await prisma.equipe.upsert({
        where: { id: e.id },
        create: { id: e.id, nom: e.nom, agenceId: e.agenceId },
        update: {},
      });
    }

    const usersData: { ref: number; nom: string; prenom: string; email: string; role: string; fonction: string; agenceId: number; equipeRef: number | null }[] = [
  { ref: 7, nom: 'Nana Ngatchou', prenom: 'Winnie Didine', email: 'winniedidine.nanangatchou@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 1, equipeRef: 1 },
  { ref: 8, nom: 'Moukou Enongue', prenom: 'Brice Deblondo', email: 'bricedeblondo.moukouenongue@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 1, equipeRef: 1 },
  { ref: 9, nom: 'Njoumou', prenom: 'Annie Guilène', email: 'annieguilene.njoumou@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 1, equipeRef: 1 },
  { ref: 10, nom: 'Younou', prenom: 'Simo', email: 'simo.younou@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 1, equipeRef: 1 },
  { ref: 11, nom: 'Teuga Domgang', prenom: 'Casimir Sarah', email: 'casimirsarah.teugadomgang@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 1, equipeRef: 1 },
  { ref: 12, nom: 'Betegne', prenom: 'Luc Vianey', email: 'lucvianey.betegne@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 1, equipeRef: 1 },
  { ref: 13, nom: 'Makam', prenom: 'Sonia Belkie', email: 'soniabelkie.makam@cecaw.cm', role: 'backoffice', fonction: 'Guichetière', agenceId: 1, equipeRef: 4 },
  { ref: 14, nom: 'Nkenfack', prenom: 'Mirabelle Clementine', email: 'mirabelleclementine.nkenfack@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 1, equipeRef: 3 },
  { ref: 15, nom: 'Siewe', prenom: 'épse Tsague Laure', email: 'laure.siewe@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 1, equipeRef: 3 },
  { ref: 16, nom: 'Tangantchoua', prenom: 'épse Zoa Sylvie', email: 'sylvie.tangantchoua@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 1, equipeRef: 3 },
  { ref: 17, nom: 'Baran', prenom: 'épse Fram A Toman Solange', email: 'solange.baran@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 1, equipeRef: 3 },
  { ref: 18, nom: 'Tomani', prenom: 'Carine Dore', email: 'carinedore.tomani@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 1, equipeRef: 3 },
  { ref: 19, nom: 'Njepgang Tchatchoua', prenom: 'Chamberline', email: 'chamberline.njepgangtchatchoua@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 1, equipeRef: 3 },
  { ref: 20, nom: 'Jingang', prenom: 'Viviane Mimi', email: 'vivianemimi.jingang@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 1, equipeRef: 3 },
  { ref: 21, nom: 'Tchakam Ngako', prenom: 'Modeste', email: 'modeste.tchakamngako@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 1, equipeRef: 3 },
  { ref: 22, nom: 'Youdeu', prenom: 'Rosaline Aimee', email: 'rosalineaimee.youdeu@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 1, equipeRef: 3 },
  { ref: 23, nom: 'Theuaho', prenom: 'Melanie Chantale', email: 'melaniechantale.theuaho@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 1, equipeRef: 3 },
  { ref: 24, nom: 'Tsafack Tankeu', prenom: 'Doriane Prisca', email: 'dorianeprisca.tsafacktankeu@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 1, equipeRef: 3 },
  { ref: 25, nom: 'Tchouassi Ngako', prenom: 'Gabel', email: 'gabel.tchouassingako@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 1, equipeRef: 3 },
  { ref: 26, nom: 'Ngako Djomeni', prenom: 'Larissa', email: 'larissa.ngakodjomeni@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 1, equipeRef: 3 },
  { ref: 27, nom: 'Akouemo Nounouim', prenom: 'Blandine', email: 'blandine.akouemonounouim@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 1, equipeRef: 3 },
  { ref: 28, nom: 'Youaleu', prenom: 'Darelle Cedia', email: 'darellecedia.youaleu@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 1, equipeRef: 3 },
  { ref: 29, nom: 'Ngo Iloga', prenom: 'Jeannette Amandine', email: 'jeannetteamandine.ngoiloga@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 1, equipeRef: 3 },
  { ref: 30, nom: 'Nguedeu', prenom: 'Hugues Marin', email: 'huguesmarin.nguedeu@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 1, equipeRef: 3 },
  { ref: 31, nom: 'Belle Otti', prenom: 'Regine', email: 'regine.belleotti@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 1, equipeRef: 3 },
  { ref: 32, nom: 'Djaba Tchouba', prenom: 'Darlaine', email: 'darlaine.djabatchouba@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 1, equipeRef: 3 },
  { ref: 33, nom: 'Mbeugang', prenom: 'Fernandez Dupplexe', email: 'fernandezdupplexe.mbeugang@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 1, equipeRef: 3 },
  { ref: 34, nom: 'Ndiang Korot', prenom: 'Antoinetta', email: 'antoinetta.ndiangkorot@cecaw.cm', role: 'manager', fonction: 'Superviseur collecte', agenceId: 1, equipeRef: 4 },
  { ref: 35, nom: 'Betssi', prenom: 'Solange épse Fouafack', email: 'solange.betssi@cecaw.cm', role: 'agent', fonction: 'Gestionnaire prêt collecte', agenceId: 1, equipeRef: 2 },
  { ref: 36, nom: 'Nkouda Tadatsin', prenom: 'Isabelle', email: 'isabelle.nkoudatadatsin@cecaw.cm', role: 'agent', fonction: 'Gestionnaire prêt collecte', agenceId: 1, equipeRef: 2 },
  { ref: 37, nom: 'Kouaong Noubissie', prenom: 'Charnele', email: 'charnele.kouaongnoubissie@cecaw.cm', role: 'agent', fonction: 'Gestionnaire prêt collecte', agenceId: 1, equipeRef: 2 },
  { ref: 38, nom: 'Djoussi Ngasse', prenom: 'Cecile Olivia', email: 'cecileolivia.djoussingasse@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 2, equipeRef: 5 },
  { ref: 39, nom: 'Mounet', prenom: 'Girelle', email: 'girelle.mounet@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 2, equipeRef: 5 },
  { ref: 40, nom: 'Tete Mbangue Sondi', prenom: 'Anne', email: 'anne.tetembanguesondi@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 2, equipeRef: 5 },
  { ref: 41, nom: 'Nguebou', prenom: 'Kevine', email: 'kevine.nguebou@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 2, equipeRef: 5 },
  { ref: 42, nom: 'Tchouanmo Mba', prenom: 'Dimitri Junior', email: 'dimitrijunior.tchouanmomba@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 2, equipeRef: 5 },
  { ref: 43, nom: 'Nguetcheu Toukep', prenom: 'Rickel', email: 'rickel.nguetcheutoukep@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 2, equipeRef: 5 },
  { ref: 44, nom: 'Kenmogne Fouyong', prenom: 'Paule Michèle', email: 'paulemichele.kenmognefouyong@cecaw.cm', role: 'backoffice', fonction: 'Guichetière', agenceId: 2, equipeRef: 8 },
  { ref: 45, nom: 'Madefo', prenom: 'Genevieve', email: 'genevieve.madefo@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 2, equipeRef: 7 },
  { ref: 46, nom: 'Mewoumbe', prenom: 'Annie', email: 'annie.mewoumbe@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 2, equipeRef: 7 },
  { ref: 47, nom: 'Mefo', prenom: 'Mireille', email: 'mireille.mefo@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 2, equipeRef: 7 },
  { ref: 48, nom: 'Faha', prenom: 'Georgette', email: 'georgette.faha@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 2, equipeRef: 7 },
  { ref: 49, nom: 'Talin', prenom: 'Jeanne', email: 'jeanne.talin@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 2, equipeRef: 7 },
  { ref: 50, nom: 'Massu', prenom: 'Christelle Jade', email: 'christellejade.massu@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 2, equipeRef: 7 },
  { ref: 51, nom: 'Ekame', prenom: 'Louise', email: 'louise.ekame@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 2, equipeRef: 7 },
  { ref: 52, nom: 'Touadjeu Tchangue', prenom: 'Elisabeth', email: 'elisabeth.touadjeutchangue@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 2, equipeRef: 7 },
  { ref: 53, nom: 'Ngoune F', prenom: 'Melanie', email: 'melanie.ngounef@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 2, equipeRef: 7 },
  { ref: 54, nom: 'Kaghogue', prenom: 'Noel Eveline', email: 'noeleveline.kaghogue@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 2, equipeRef: 7 },
  { ref: 55, nom: 'Tchiadjeu Moungoue', prenom: 'Tatiana', email: 'tatiana.tchiadjeumoungoue@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 2, equipeRef: 7 },
  { ref: 56, nom: 'Kapche Siliedje', prenom: 'Marie Doriane', email: 'mariedoriane.kapchesiliedje@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 2, equipeRef: 7 },
  { ref: 57, nom: 'Djoumessi Depoupo', prenom: 'Dorcreche', email: 'dorcreche.djoumessidepoupo@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 2, equipeRef: 7 },
  { ref: 58, nom: 'Wasso Fankam', prenom: 'Steve', email: 'steve.wassofankam@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 2, equipeRef: 7 },
  { ref: 59, nom: 'Simen Tchoufong', prenom: 'Viviane', email: 'viviane.simentchoufong@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 2, equipeRef: 7 },
  { ref: 60, nom: 'Djoumbat', prenom: 'Ariane Victoire', email: 'arianevictoire.djoumbat@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 2, equipeRef: 7 },
  { ref: 61, nom: 'Nguetchayou', prenom: 'Larissa Carine', email: 'larissacarine.nguetchayou@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 2, equipeRef: 7 },
  { ref: 62, nom: 'Tchatche Djamie', prenom: 'Vanessa', email: 'vanessa.tchatchedjamie@cecaw.cm', role: 'manager', fonction: 'Superviseur collecte', agenceId: 2, equipeRef: 8 },
  { ref: 63, nom: 'Nelly Djengou', prenom: 'Nsia Esther', email: 'nsiaesther.nellydjengou@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 10, equipeRef: 9 },
  { ref: 64, nom: 'Keubou Wagou', prenom: 'Nina épse Kengue', email: 'ninakengue.keubouwagou@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 10, equipeRef: 9 },
  { ref: 65, nom: 'Kenfack Fokou', prenom: 'Elsa Ebenezere', email: 'elsaebenezere.kenfackfokou@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 10, equipeRef: 9 },
  { ref: 66, nom: 'Nanfack', prenom: 'Ornelle Verdis', email: 'ornelleverdis.nanfack@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 10, equipeRef: 9 },
  { ref: 67, nom: 'Tatio', prenom: 'Evaw Junior', email: 'evawjunior.tatio@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 10, equipeRef: 9 },
  { ref: 68, nom: 'Tchouassi', prenom: 'Therese Maurine', email: 'theresemaurine.tchouassi@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 10, equipeRef: 9 },
  { ref: 69, nom: 'Ngadoum Debora', prenom: 'Prudence', email: 'prudence.ngadoumdebora@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 10, equipeRef: 9 },
  { ref: 70, nom: 'Tchanou Kamnang', prenom: 'Austin', email: 'austin.tchanoukamnang@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 10, equipeRef: 9 },
  { ref: 71, nom: 'Ngounou Koyue', prenom: 'Dorice Christian', email: 'doricechristian.ngounoukoyue@cecaw.cm', role: 'backoffice', fonction: 'Guichetière', agenceId: 10, equipeRef: 12 },
  { ref: 72, nom: 'Djuidje', prenom: 'Debaura', email: 'debaura.djuidje@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 10, equipeRef: 11 },
  { ref: 73, nom: 'Megha Fopa', prenom: 'Rosine', email: 'rosine.meghafopa@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 10, equipeRef: 11 },
  { ref: 74, nom: 'Djomako', prenom: 'Guillaine', email: 'guillaine.djomako@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 10, equipeRef: 11 },
  { ref: 75, nom: 'Mbenty', prenom: 'Lucie Laure', email: 'lucielaure.mbenty@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 10, equipeRef: 11 },
  { ref: 76, nom: 'Guiadjou', prenom: 'Chanceline', email: 'chanceline.guiadjou@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 10, equipeRef: 11 },
  { ref: 77, nom: 'Sendjeu Tchanga', prenom: 'Wulliamide', email: 'wulliamide.sendjeutchanga@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 10, equipeRef: 11 },
  { ref: 78, nom: 'Temfack Tsapzang', prenom: 'Christel', email: 'christel.temfacktsapzang@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 10, equipeRef: 11 },
  { ref: 79, nom: 'Yetgni', prenom: 'Christelle Carole', email: 'christellecarole.yetgni@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 10, equipeRef: 11 },
  { ref: 80, nom: 'Ndzie', prenom: 'Bertille', email: 'bertille.ndzie@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 10, equipeRef: 11 },
  { ref: 81, nom: 'Mamba Nyambi', prenom: 'Madeleine', email: 'madeleine.mambanyambi@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 10, equipeRef: 11 },
  { ref: 82, nom: 'Fobasso Tamguelong', prenom: 'Ginette', email: 'ginette.fobassotamguelong@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 10, equipeRef: 11 },
  { ref: 83, nom: 'Yougmegni Gankam', prenom: 'Carole', email: 'carole.yougmegnigankam@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 10, equipeRef: 11 },
  { ref: 84, nom: 'Magnigue Kamga', prenom: 'Sandrine', email: 'sandrine.magniguekamga@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 10, equipeRef: 11 },
  { ref: 85, nom: 'Doukeu Kuetchoua', prenom: 'Judith Laure', email: 'judithlaure.doukeukuetchoua@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 10, equipeRef: 11 },
  { ref: 86, nom: 'Fokou Obein', prenom: 'Lebien', email: 'lebien.fokouobein@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 10, equipeRef: 11 },
  { ref: 87, nom: 'Wandji', prenom: 'Raissa', email: 'raissa.wandji@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 10, equipeRef: 11 },
  { ref: 88, nom: 'Ananfack Kemtsop', prenom: 'Andre', email: 'andre.ananfackkemtsop@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 10, equipeRef: 11 },
  { ref: 89, nom: 'Nguimatsia Kemgang', prenom: 'Mavel', email: 'mavel.nguimatsiakemgang@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 10, equipeRef: 11 },
  { ref: 90, nom: 'Tanmi Nana', prenom: 'Emma Léonie', email: 'emmaleonie.tanminana@cecaw.cm', role: 'manager', fonction: 'Superviseur collecte', agenceId: 10, equipeRef: 12 },
  { ref: 91, nom: 'Kuate Ngamgne', prenom: 'Sandrine', email: 'sandrine.kuatengamgne@cecaw.cm', role: 'agent', fonction: 'Gestionnaire prêt collecte', agenceId: 10, equipeRef: 10 },
  { ref: 92, nom: 'Ndiang Christine', prenom: 'Linda', email: 'linda.ndiangchristine@cecaw.cm', role: 'agent', fonction: 'Gestionnaire prêt collecte', agenceId: 10, equipeRef: 10 },
  { ref: 93, nom: 'Ndoya Nganko', prenom: 'Leaticia Diane', email: 'leaticiadiane.ndoyanganko@cecaw.cm', role: 'agent', fonction: 'Gestionnaire prêt collecte', agenceId: 10, equipeRef: 10 },
  { ref: 94, nom: 'Mekuaté Siledje', prenom: 'Hermine flore', email: 'hermineflore.mekuatesiledje@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 3, equipeRef: 13 },
  { ref: 95, nom: 'Kamaha Yamdjeu', prenom: 'Horly Brice', email: 'horlybrice.kamahayamdjeu@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 3, equipeRef: 13 },
  { ref: 96, nom: 'Nsing Um', prenom: 'Emmanuel', email: 'emmanuel.nsingum@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 3, equipeRef: 13 },
  { ref: 97, nom: 'Abanda Meboni', prenom: 'Jeanne Dorcas', email: 'jeannedorcas.abandameboni@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 3, equipeRef: 13 },
  { ref: 98, nom: 'Djuidje', prenom: 'Rayssa Noelle', email: 'rayssanoelle.djuidje@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 3, equipeRef: 13 },
  { ref: 99, nom: 'Bessala Ndzana', prenom: 'Herman', email: 'herman.bessalandzana@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 3, equipeRef: 13 },
  { ref: 100, nom: 'Nkammen Djami', prenom: 'Pachelle', email: 'pachelle.nkammendjami@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 3, equipeRef: 13 },
  { ref: 101, nom: 'Atonmezing', prenom: 'Blandine', email: 'blandine.atonmezing@cecaw.cm', role: 'backoffice', fonction: 'Guichetière', agenceId: 3, equipeRef: 16 },
  { ref: 102, nom: 'Wansi', prenom: 'Nicole', email: 'nicole.wansi@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 3, equipeRef: 15 },
  { ref: 103, nom: 'Kembou', prenom: 'Nicole', email: 'nicole.kembou@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 3, equipeRef: 15 },
  { ref: 104, nom: 'Letieu', prenom: 'Chamberline', email: 'chamberline.letieu@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 3, equipeRef: 15 },
  { ref: 105, nom: 'Guemo', prenom: 'Athalie', email: 'athalie.guemo@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 3, equipeRef: 15 },
  { ref: 106, nom: 'Toukem', prenom: 'Anne', email: 'anne.toukem@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 3, equipeRef: 15 },
  { ref: 107, nom: 'Mfouche', prenom: 'Rosalie', email: 'rosalie.mfouche@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 3, equipeRef: 15 },
  { ref: 108, nom: 'Amekeu', prenom: 'Stevie', email: 'stevie.amekeu@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 3, equipeRef: 15 },
  { ref: 109, nom: 'Apoupo', prenom: 'Gaelle', email: 'gaelle.apoupo@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 3, equipeRef: 15 },
  { ref: 110, nom: 'Ngwang Haggai', prenom: 'Sandrine', email: 'sandrine.ngwanghaggai@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 3, equipeRef: 15 },
  { ref: 111, nom: 'Madjeumo', prenom: 'Victorine', email: 'victorine.madjeumo@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 3, equipeRef: 15 },
  { ref: 112, nom: 'Magne', prenom: 'Judith', email: 'judith.magne@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 3, equipeRef: 15 },
  { ref: 113, nom: 'Djouodoug', prenom: 'épse Tambeck Chimene', email: 'chimene.djouodoug@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 3, equipeRef: 15 },
  { ref: 114, nom: 'Makougoum Takam', prenom: 'Sorelle Nickelle', email: 'sorellenickelle.makougoumtakam@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 3, equipeRef: 15 },
  { ref: 115, nom: 'Tiazia', prenom: 'Roseline', email: 'roseline.tiazia@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 3, equipeRef: 15 },
  { ref: 116, nom: 'Mamo Tchoffo', prenom: 'Guylene', email: 'guylene.mamotchoffo@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 3, equipeRef: 15 },
  { ref: 117, nom: 'Teumou Tchamba', prenom: 'Nafissetou', email: 'nafissetou.teumoutchamba@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 3, equipeRef: 15 },
  { ref: 118, nom: 'Kuemi', prenom: 'Vanessa Colinette', email: 'vanessacolinette.kuemi@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 3, equipeRef: 15 },
  { ref: 119, nom: 'Tchuenguem Modjo', prenom: 'Laure', email: 'laure.tchuenguemmodjo@cecaw.cm', role: 'manager', fonction: 'Superviseur collecte', agenceId: 3, equipeRef: 16 },
  { ref: 120, nom: 'Tondji Kouayip', prenom: 'Ghislaine', email: 'ghislaine.tondjikouayip@cecaw.cm', role: 'agent', fonction: 'Gestionnaire prêt collecte', agenceId: 3, equipeRef: 14 },
  { ref: 121, nom: 'Meibou Gwokam', prenom: 'Vinet Ilaria', email: 'vinetilaria.meibougwokam@cecaw.cm', role: 'agent', fonction: 'Gestionnaire prêt collecte', agenceId: 3, equipeRef: 14 },
  { ref: 122, nom: 'Zefack Tonleu', prenom: 'Miriam Marvelle', email: 'miriammarvelle.zefacktonleu@cecaw.cm', role: 'agent', fonction: 'Gestionnaire prêt collecte', agenceId: 3, equipeRef: 14 },
  { ref: 123, nom: 'Atemazem Tsanang', prenom: 'Francky Jaures', email: 'franckyjaures.atemazemtsanang@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 4, equipeRef: 17 },
  { ref: 124, nom: 'Kamdem', prenom: 'Parfait Valentin', email: 'parfaitvalentin.kamdem@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 4, equipeRef: 17 },
  { ref: 125, nom: 'Noulah Tchouteizo', prenom: 'Paule Prudence', email: 'pauleprudence.noulahtchouteizo@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 4, equipeRef: 17 },
  { ref: 126, nom: 'Kepseu Sahou', prenom: 'Landry', email: 'landry.kepseusahou@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 4, equipeRef: 17 },
  { ref: 127, nom: 'Kameni Kouendjou', prenom: 'Ines', email: 'ines.kamenikouendjou@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 4, equipeRef: 17 },
  { ref: 128, nom: 'Djeunang Foteu', prenom: 'Wilson Bruno', email: 'wilsonbruno.djeunangfoteu@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 4, equipeRef: 17 },
  { ref: 129, nom: 'Fosso Mokam', prenom: 'Sandra', email: 'sandra.fossomokam@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 4, equipeRef: 17 },
  { ref: 130, nom: 'Talla', prenom: 'Aloick Idriss', email: 'aloickidriss.talla@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 4, equipeRef: 17 },
  { ref: 131, nom: 'Fozoue', prenom: 'Merveille Kevine', email: 'merveillekevine.fozoue@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 4, equipeRef: 17 },
  { ref: 132, nom: 'Tchinda Tsopa', prenom: 'épse Difo Larissa', email: 'larissa.tchindatsopa@cecaw.cm', role: 'backoffice', fonction: 'Guichetière', agenceId: 4, equipeRef: 20 },
  { ref: 133, nom: 'Guiadem', prenom: 'Nadine Benedicte', email: 'nadinebenedicte.guiadem@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 4, equipeRef: 19 },
  { ref: 134, nom: 'Segning Nanfa', prenom: 'Egwige L', email: 'egwigel.segningnanfa@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 4, equipeRef: 19 },
  { ref: 135, nom: 'Jipgang Chendjou', prenom: 'Octavia', email: 'octavia.jipgangchendjou@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 4, equipeRef: 19 },
  { ref: 136, nom: 'Nodem Nanfa', prenom: 'Marie', email: 'marie.nodemnanfa@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 4, equipeRef: 19 },
  { ref: 137, nom: 'Magne Poaka', prenom: 'Julienne Eloise', email: 'julienneeloise.magnepoaka@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 4, equipeRef: 19 },
  { ref: 138, nom: 'Ngo Ngwem', prenom: 'Marie Natacha', email: 'marienatacha.ngongwem@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 4, equipeRef: 19 },
  { ref: 139, nom: 'Tchouga', prenom: 'Franck Alex', email: 'franckalex.tchouga@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 4, equipeRef: 19 },
  { ref: 140, nom: 'Sofeu Fotsi', prenom: 'Lothilde Adrielle', email: 'lothildeadrielle.sofeufotsi@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 4, equipeRef: 19 },
  { ref: 141, nom: 'Talla Makoutsing', prenom: 'Velene Sukissa', email: 'velenesukissa.tallamakoutsing@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 4, equipeRef: 19 },
  { ref: 142, nom: 'Synthia Berinyuy', prenom: 'Ngivelon', email: 'ngivelon.synthiaberinyuy@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 4, equipeRef: 19 },
  { ref: 143, nom: 'Lele Tchomtchoua', prenom: 'Sandra Danoucia', email: 'sandradanoucia.leletchomtchoua@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 4, equipeRef: 19 },
  { ref: 144, nom: 'Segning Diffo', prenom: 'Edith Laure', email: 'edithlaure.segningdiffo@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 4, equipeRef: 19 },
  { ref: 145, nom: 'Magokeng Kenne', prenom: 'Lavissa Sonia', email: 'lavissasonia.magokengkenne@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 4, equipeRef: 19 },
  { ref: 146, nom: 'Meboue Peubong', prenom: 'Rosine Diane', email: 'rosinediane.mebouepeubong@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 4, equipeRef: 19 },
  { ref: 147, nom: 'Mantho', prenom: 'Duchelle Fabiola', email: 'duchellefabiola.mantho@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 4, equipeRef: 19 },
  { ref: 148, nom: 'Mouoffokouo Poukam', prenom: 'Elisabeth', email: 'elisabeth.mouoffokouopoukam@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 4, equipeRef: 19 },
  { ref: 149, nom: 'Meche Bogne', prenom: 'Mireille', email: 'mireille.mechebogne@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 4, equipeRef: 19 },
  { ref: 150, nom: 'Ngomdop', prenom: 'Lucresse Nicaise', email: 'lucressenicaise.ngomdop@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 4, equipeRef: 19 },
  { ref: 151, nom: 'Tebu Lele', prenom: 'Lucresse Nicaise', email: 'lucressenicaise.tebulele@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 4, equipeRef: 19 },
  { ref: 152, nom: 'Mebouet', prenom: 'épse Pone', email: 'pone.mebouet@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 4, equipeRef: 19 },
  { ref: 153, nom: 'Tsafack', prenom: 'Carine Pélagie', email: 'carinepelagie.tsafack@cecaw.cm', role: 'manager', fonction: 'Superviseur collecte', agenceId: 4, equipeRef: 20 },
  { ref: 154, nom: 'Metueno Dzeboa', prenom: 'épse Tiako Larissa', email: 'larissa.metuenodzeboa@cecaw.cm', role: 'agent', fonction: 'Gestionnaire prêt collecte', agenceId: 4, equipeRef: 18 },
  { ref: 155, nom: 'Djuissi Ndungne', prenom: 'Christelle', email: 'christelle.djuissindungne@cecaw.cm', role: 'agent', fonction: 'Gestionnaire prêt collecte', agenceId: 4, equipeRef: 18 },
  { ref: 156, nom: 'Tchiechie Tchaeha', prenom: 'Franklin Nelson', email: 'franklinnelson.tchiechietchaeha@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 5, equipeRef: 21 },
  { ref: 157, nom: 'Tchiffo Soctio', prenom: 'Franck Omer', email: 'franckomer.tchiffosoctio@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 5, equipeRef: 21 },
  { ref: 158, nom: 'Ndema Nkrumah', prenom: 'Gwet', email: 'gwet.ndemankrumah@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 5, equipeRef: 21 },
  { ref: 159, nom: 'Tchako', prenom: 'Dorkas', email: 'dorkas.tchako@cecaw.cm', role: 'backoffice', fonction: 'Guichetière', agenceId: 5, equipeRef: 24 },
  { ref: 160, nom: 'Djabou', prenom: 'Viviane', email: 'viviane.djabou@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 5, equipeRef: 23 },
  { ref: 161, nom: 'Mouga', prenom: 'Tatiane', email: 'tatiane.mouga@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 5, equipeRef: 23 },
  { ref: 162, nom: 'Anafack Maguimekem', prenom: 'Madeleine', email: 'madeleine.anafackmaguimekem@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 5, equipeRef: 23 },
  { ref: 163, nom: 'Tchapda', prenom: 'Stephanie', email: 'stephanie.tchapda@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 5, equipeRef: 23 },
  { ref: 164, nom: 'Tchouboume', prenom: 'Leocadie Raissa', email: 'leocadieraisa.tchouboume@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 5, equipeRef: 23 },
  { ref: 165, nom: 'Tchakoutio', prenom: 'Charlie', email: 'charlie.tchakoutio@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 5, equipeRef: 23 },
  { ref: 166, nom: 'Diffo Saha', prenom: 'Zaviera', email: 'zaviera.diffosaha@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 5, equipeRef: 23 },
  { ref: 167, nom: 'Nguefa', prenom: 'Genevieve Michael', email: 'genevievemichael.nguefa@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 5, equipeRef: 23 },
  { ref: 168, nom: 'Foyet', prenom: 'Oscarine', email: 'oscarine.foyet@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 5, equipeRef: 23 },
  { ref: 169, nom: 'Kwedi Mbappe', prenom: 'Elise Francine', email: 'elisefrancine.kwedimbappe@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 5, equipeRef: 23 },
  { ref: 170, nom: 'Kouobou Moaffo', prenom: 'Catherine Sonia', email: 'catherinesonia.kouoboumoaffo@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 5, equipeRef: 23 },
  { ref: 171, nom: 'Fossi Makuetche', prenom: 'Emmanuelle', email: 'emmanuelle.fossimakuetche@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 5, equipeRef: 23 },
  { ref: 172, nom: 'Yamgoh', prenom: 'Perpetual', email: 'perpetual.yamgoh@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 5, equipeRef: 23 },
  { ref: 173, nom: 'Lemoukong', prenom: 'Linda Sorelle', email: 'lindasorelle.lemoukong@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 5, equipeRef: 23 },
  { ref: 174, nom: 'Yoneu Ekomo', prenom: 'Geordane Morelle', email: 'geordanemorelle.yoneuekomo@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 5, equipeRef: 23 },
  { ref: 175, nom: 'Wague Donfack', prenom: 'Pelagie', email: 'pelagie.wagnedonfack@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 5, equipeRef: 23 },
  { ref: 176, nom: 'Poupo', prenom: 'Alice', email: 'alice.poupo@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 5, equipeRef: 23 },
  { ref: 177, nom: 'Tchienou Tchamba', prenom: 'Joelle', email: 'joelle.tchienoutchamba@cecaw.cm', role: 'manager', fonction: 'Superviseur collecte', agenceId: 5, equipeRef: 24 },
  { ref: 178, nom: 'Enyegue', prenom: 'Madeleine Claudia', email: 'madeleineclaudia.enyegue@cecaw.cm', role: 'agent', fonction: 'Gestionnaire prêt collecte', agenceId: 5, equipeRef: 22 },
  { ref: 179, nom: 'Yoba', prenom: 'Christelle Laure', email: 'christellelaure.yoba@cecaw.cm', role: 'agent', fonction: 'Gestionnaire prêt collecte', agenceId: 5, equipeRef: 22 },
  { ref: 180, nom: 'Zepop Nzokizep', prenom: 'Yamine Martinez', email: 'yaminemartinez.zepopnzokizep@cecaw.cm', role: 'agent', fonction: 'Gestionnaire prêt collecte', agenceId: 5, equipeRef: 22 },
  { ref: 181, nom: 'Kahou Tsafack', prenom: 'Annicet', email: 'annicet.kahoutsafack@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 6, equipeRef: 25 },
  { ref: 182, nom: 'Maffo Dongfack', prenom: 'Aline Gael', email: 'alinegael.maffodongfack@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 6, equipeRef: 25 },
  { ref: 183, nom: 'Azapmo Tonfack', prenom: 'Etienne Junior', email: 'etiennejunior.azapmotonfack@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 6, equipeRef: 25 },
  { ref: 184, nom: 'Tchassi Leukeumo', prenom: 'William Hermann', email: 'williamhermann.tchassileukeumo@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 6, equipeRef: 25 },
  { ref: 185, nom: 'Wintcheu Wortchoko', prenom: 'Julienne Sorelle', email: 'juliennesorelle.wintcheuwortchoko@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 6, equipeRef: 25 },
  { ref: 186, nom: 'Tadondje Momo', prenom: 'Bonita Charonne', email: 'bonitacharonne.tadondjemomo@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 6, equipeRef: 25 },
  { ref: 187, nom: 'Donfack Lekefack', prenom: 'Paganel', email: 'paganel.donfacklekefack@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 6, equipeRef: 25 },
  { ref: 188, nom: 'Makamtchop', prenom: 'Virginie', email: 'virginie.makamtchop@cecaw.cm', role: 'backoffice', fonction: 'Guichetière', agenceId: 6, equipeRef: 28 },
  { ref: 189, nom: 'Tsafack Mekemjio', prenom: 'Ernestine', email: 'ernestine.tsafackmekemjio@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 6, equipeRef: 27 },
  { ref: 190, nom: 'Dongmo Vouffo', prenom: 'Benjeamine', email: 'benjeamine.dongmovouffo@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 6, equipeRef: 27 },
  { ref: 191, nom: 'Teufack', prenom: 'Quelisa Ayssa', email: 'quelisaayssa.teufack@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 6, equipeRef: 27 },
  { ref: 192, nom: 'Tsafong', prenom: 'Christelle', email: 'christelle.tsafong@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 6, equipeRef: 27 },
  { ref: 193, nom: 'Akiteu Minthet', prenom: 'Lea', email: 'lea.akiteuminthet@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 6, equipeRef: 27 },
  { ref: 194, nom: 'Angue Woussi', prenom: 'Gaelle', email: 'gaelle.anguewoussi@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 6, equipeRef: 27 },
  { ref: 195, nom: 'Tchekouo', prenom: 'Hermine', email: 'hermine.tchekouo@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 6, equipeRef: 27 },
  { ref: 196, nom: 'Lekane Tsafack', prenom: 'Justine', email: 'justine.lekanetsafack@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 6, equipeRef: 27 },
  { ref: 197, nom: 'Metampa', prenom: 'Lucresse Charnelle', email: 'lucressecharnelle.metampa@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 6, equipeRef: 27 },
  { ref: 198, nom: 'Manenang Jeufack', prenom: 'Jidicaelle Charlotte', email: 'jidicaellecharlotte.manenangjeufack@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 6, equipeRef: 27 },
  { ref: 199, nom: 'Nague Tonfack', prenom: 'Stevie Charnelle', email: 'steviecharnelle.naguetonfack@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 6, equipeRef: 27 },
  { ref: 200, nom: 'Temfack', prenom: 'Nadine Christelle', email: 'nadinechristelle.temfack@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 6, equipeRef: 27 },
  { ref: 201, nom: 'Donfack', prenom: 'Valdes', email: 'valdes.donfack@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 6, equipeRef: 27 },
  { ref: 202, nom: 'Assonfack Djoumessi', prenom: 'Madeleine', email: 'madeleine.assonfackdjoumessi@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 6, equipeRef: 27 },
  { ref: 203, nom: 'Feumo Delisa', prenom: 'An Mabelle', email: 'anmabelle.feumodelisa@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 6, equipeRef: 27 },
  { ref: 204, nom: 'Donfack Zebaze', prenom: 'Staline Lakene', email: 'stalinelakene.donfackzebaze@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 6, equipeRef: 27 },
  { ref: 205, nom: 'Chimini', prenom: 'Flauriane Lauraine', email: 'flaurianelauraine.chimini@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 6, equipeRef: 27 },
  { ref: 206, nom: 'Komene Manefouet', prenom: 'Jeanine épse Kenfack', email: 'jeanine.komenemanefouet@cecaw.cm', role: 'manager', fonction: 'Superviseur collecte', agenceId: 6, equipeRef: 28 },
  { ref: 207, nom: 'Matchidjio', prenom: 'Mariane Nadine', email: 'marianenadine.matchidjio@cecaw.cm', role: 'agent', fonction: 'Gestionnaire prêt collecte', agenceId: 6, equipeRef: 26 },
  { ref: 208, nom: 'Leussi Chuipa', prenom: 'Ornella Audrey', email: 'ornellaaudrey.leussichuipa@cecaw.cm', role: 'agent', fonction: 'Gestionnaire prêt collecte', agenceId: 6, equipeRef: 26 },
  { ref: 209, nom: 'Olomo Amimba', prenom: 'Barnabe Vivien', email: 'barnabevivien.olomoamimba@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 7, equipeRef: 29 },
  { ref: 210, nom: 'Essono Fowo', prenom: 'Yann Maxime', email: 'yannmaxime.essonofowo@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 7, equipeRef: 29 },
  { ref: 211, nom: 'Ambomo', prenom: 'Alexandre Gordon', email: 'alexandregordon.ambomo@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 7, equipeRef: 29 },
  { ref: 212, nom: 'Nongni', prenom: 'Idris Roberto', email: 'idrisroberto.nongni@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 7, equipeRef: 29 },
  { ref: 213, nom: 'Eboutou', prenom: 'Paul Yannick', email: 'paulyannick.eboutou@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 7, equipeRef: 29 },
  { ref: 214, nom: 'Aboya', prenom: 'Gladys Madeleine', email: 'gladysmadeleine.aboya@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 7, equipeRef: 29 },
  { ref: 215, nom: 'Abidime Emboueme', prenom: 'Nadège', email: 'nadege.abidimeemboueme@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 7, equipeRef: 29 },
  { ref: 216, nom: 'Tjemi', prenom: 'Grace Cécile', email: 'gracececile.tjemi@cecaw.cm', role: 'agent', fonction: 'Gestionnaire de credit classique', agenceId: 7, equipeRef: 29 },
  { ref: 217, nom: 'Chouna', prenom: 'Gwladys epse Fossa', email: 'gwladys.chouna@cecaw.cm', role: 'backoffice', fonction: 'Guichetière', agenceId: 7, equipeRef: 32 },
  { ref: 218, nom: 'Nanga Ombede', prenom: 'Cecile', email: 'cecile.nangaombede@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 7, equipeRef: 31 },
  { ref: 219, nom: 'Ongolo Ombede', prenom: 'Brigitte Nadine', email: 'brigittenadine.ongoloombede@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 7, equipeRef: 31 },
  { ref: 220, nom: 'Batipamen', prenom: 'Jacqueline', email: 'jacqueline.batipamen@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 7, equipeRef: 31 },
  { ref: 221, nom: 'Bella Wono', prenom: 'Pauline', email: 'pauline.bellawono@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 7, equipeRef: 31 },
  { ref: 222, nom: 'Essengue', prenom: 'Anne Nadine', email: 'annenadine.essengue@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 7, equipeRef: 31 },
  { ref: 223, nom: 'Tsama Belibi', prenom: 'Cecile Nadege', email: 'cecilenadege.tsamabelibi@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 7, equipeRef: 31 },
  { ref: 224, nom: 'Yana Nyemb', prenom: 'Ariane', email: 'ariane.yananyemb@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 7, equipeRef: 31 },
  { ref: 225, nom: 'Mvotto Andinga', prenom: 'Morane', email: 'morane.mvottoandinga@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 7, equipeRef: 31 },
  { ref: 226, nom: 'Njeunko', prenom: 'epse Noutat Bergeline', email: 'bergeline.njeunko@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 7, equipeRef: 31 },
  { ref: 227, nom: 'Moloh Onana', prenom: 'Amandine Pascaline', email: 'amandinepascaline.molohonana@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 7, equipeRef: 31 },
  { ref: 228, nom: 'Bediang', prenom: 'Merveille Rachel', email: 'merveillerachel.bediang@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 7, equipeRef: 31 },
  { ref: 229, nom: 'Ngah', prenom: 'Elisabeth Clarisse', email: 'elisabethclarisse.ngah@cecaw.cm', role: 'agent', fonction: 'Commercial', agenceId: 7, equipeRef: 31 },
  { ref: 230, nom: 'Kana Mawamba', prenom: 'Léa', email: 'lea.kanamawamba@cecaw.cm', role: 'manager', fonction: 'Superviseur collecte', agenceId: 7, equipeRef: 32 },
  { ref: 231, nom: 'Fosso Anafack', prenom: 'Ariane epse Ngueko', email: 'ariane.fossoanafack@cecaw.cm', role: 'agent', fonction: 'Gestionnaire prêt collecte', agenceId: 7, equipeRef: 30 },
  { ref: 232, nom: 'Amombo Etoundi', prenom: 'Shanel', email: 'shanel.amomboetoundi@cecaw.cm', role: 'agent', fonction: 'Gestionnaire prêt collecte', agenceId: 7, equipeRef: 30 },
    ];

    const userIdByRef = new Map<number, number>();
    for (const u of usersData) {
      const rec = await prisma.utilisateur.upsert({
        where: { email: u.email },
        create: {
          nom: u.nom, prenom: u.prenom, email: u.email, password: hash,
          role: u.role as 'admin' | 'manager' | 'backoffice' | 'agent',
          fonction: u.fonction, agenceId: u.agenceId, equipeId: u.equipeRef ?? undefined,
          actif: true,
        },
        update: {},
      });
      userIdByRef.set(u.ref, rec.id);
    }

    for (const e of equipesData) {
      const responsableId = userIdByRef.get(e.responsableRef);
      if (responsableId) {
        await prisma.equipe.update({ where: { id: e.id }, data: { responsableId } });
      }
    }

    console.log(`   👥 ${usersData.length} utilisateurs importés depuis la fiche commerciaux (10 agences, 32 équipes)`);
  }

  // ── Agents terrain ────────────────────────────────────────────────
  const agentMatricules = ['AGT-001', 'AGT-002', 'AGT-003'];
  const agentRecords = [];

  for (let i = 0; i < agentUserRecords.length; i++) {
    const u = agentUserRecords[i];
    const existing = await prisma.agent.findUnique({ where: { utilisateurId: u.id } });
    if (!existing) {
      const a = await prisma.agent.create({
        data: {
          utilisateurId: u.id,
          matricule: agentMatricules[i],
          secteur: i === 0 ? 'Zone Akwa-Nord' : i === 1 ? 'Zone Bépanda' : 'Zone Ndokoti',
          latitude: 4.05 + i * 0.01,
          longitude: 9.77 + i * 0.01,
          dernierePositionAt: new Date(),
        },
      });
      agentRecords.push(a);
    } else {
      agentRecords.push(existing);
    }
  }

  // ── Objectif exemple ──────────────────────────────────────────────
  if (agentRecords.length > 0) {
    const existingObj = await prisma.objectif.findFirst();
    if (!existingObj) {
      await prisma.objectif.create({
        data: {
          titre: 'Objectif collecte Juin 2025',
          produitId: 4,
          cible: 500000,
          unite: 'montant',
          periodicite: 'mois',
          dateDebut: new Date('2025-06-01'),
          dateFin: new Date('2025-06-30'),
          assignationType: 'agents',
          realise: 312000,
          statut: 'en_cours',
          createdById: admin.id,
          agents: { create: agentRecords.map((a) => ({ agentId: a.id })) },
        },
      });
    }
  }

  // ── Prospect exemple ──────────────────────────────────────────────
  if (!(await prisma.prospect.findFirst())) {
    await prisma.prospect.create({
      data: {
        nom: 'Fotso',
        prenom: 'Alain',
        genre: 'M',
        telephone: '+237 655 123 456',
        email: 'alain.fotso@gmail.com',
        ville: 'Douala',
        quartier: 'Akwa',
        adresse: 'Rue de la Paix',
        profession: 'Commerçant',
        statut: 'interesse',
        produitInteretId: 4,
        commercialId: agentUserRecords[0]?.id ?? admin.id,
        notes: 'Très intéressé par la collecte journalière.',
        latitude: 4.0511,
        longitude: 9.7679,
      },
    });
  }

  // Les upserts ci-dessus insèrent avec des ids explicites, ce qui ne fait pas
  // avancer les séquences auto-increment de Postgres : on les resynchronise
  // sur MAX(id) pour éviter des collisions de clé primaire (409) sur les futures créations.
  for (const table of ['produits', 'groupes_produits', 'agences', 'equipes']) {
    await prisma.$executeRawUnsafe(
      `SELECT setval('${table}_id_seq', COALESCE((SELECT MAX(id) FROM ${table}), 1))`
    );
  }

  console.log('✅ Seed completed!');
  console.log(`   📧 Admin: admin@cecaw.cm / ${DEFAULT_PASSWORD}`);
  console.log(`   📧 Manager: m.ngassa@cecaw.cm / ${DEFAULT_PASSWORD}`);
  console.log(`   📧 Agent: j.mvondo@cecaw.cm / ${DEFAULT_PASSWORD}`);
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
