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

  // ── Équipe principale (Dakar) ─────────────────────────────────────
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

  const equipe1 = await prisma.equipe.upsert({
    where: { id: 1 },
    create: { nom: 'Équipe Dakar', agenceId: 1, responsableId: manager.id },
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
      create: { ...au, password: hash, role: 'agent', agenceId: 1, equipeId: equipe1.id, actif: true },
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

  console.log('✅ Seed completed!');
  console.log(`   📧 Admin: admin@cecaw.cm / ${DEFAULT_PASSWORD}`);
  console.log(`   📧 Manager: m.ngassa@cecaw.cm / ${DEFAULT_PASSWORD}`);
  console.log(`   📧 Agent: j.mvondo@cecaw.cm / ${DEFAULT_PASSWORD}`);
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
