export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'CECAW CRM API',
    version: '1.0.0',
    description: 'API backend du CRM CECAW Microfinance — Node.js / Express / Prisma / PostgreSQL',
    contact: { name: 'CECAW IT', email: 'admin@cecaw.cm' },
  },
  servers: [
    { url: 'http://localhost:4000/api/v1', description: 'Développement local' },
  ],
  tags: [
    { name: 'Auth', description: 'Authentification & profil' },
    { name: 'Agences', description: 'Gestion des agences' },
    { name: 'Équipes', description: 'Gestion des équipes' },
    { name: 'Groupes Produits', description: 'Groupes de produits' },
    { name: 'Produits', description: 'Produits financiers' },
    { name: 'Utilisateurs', description: 'Gestion des utilisateurs' },
    { name: 'Prospects', description: 'Pipeline CRM prospects' },
    { name: 'Clients', description: 'Gestion des clients' },
    { name: 'Comptes', description: 'Comptes clients' },
    { name: 'Transactions', description: 'Opérations financières' },
    { name: 'Agents', description: 'Agents terrain & GPS' },
    { name: 'Objectifs', description: 'Objectifs de collecte' },
    { name: 'Statistiques', description: 'Performances & KPIs' },
    { name: 'Journal', description: "Journal d'activité" },
    { name: 'Dashboard', description: 'Données tableau de bord' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
          errors: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
        },
      },
      Meta: {
        type: 'object',
        properties: {
          page: { type: 'integer', example: 1 },
          per_page: { type: 'integer', example: 20 },
          total: { type: 'integer', example: 245 },
        },
      },
      Agence: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          nom: { type: 'string', example: 'Agence Dakar' },
          ville: { type: 'string', example: 'Douala' },
          adresse: { type: 'string', nullable: true },
          actif: { type: 'boolean' },
          nb_equipes: { type: 'integer' },
          nb_utilisateurs: { type: 'integer' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      Equipe: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          nom: { type: 'string' },
          agence: { $ref: '#/components/schemas/RefAgence' },
          responsable: { $ref: '#/components/schemas/RefUser', nullable: true },
          nb_membres: { type: 'integer' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      GroupeProduit: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          nom: { type: 'string' },
          description: { type: 'string', nullable: true },
          couleur: { type: 'string', example: '#10b981' },
          nb_produits: { type: 'integer' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      Produit: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          nom: { type: 'string' },
          description: { type: 'string', nullable: true },
          actif: { type: 'boolean' },
          groupe: { $ref: '#/components/schemas/RefGroupe' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      Utilisateur: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          nom: { type: 'string' },
          prenom: { type: 'string' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['admin', 'manager', 'backoffice', 'agent'] },
          fonction: { type: 'string', nullable: true },
          actif: { type: 'boolean' },
          agence: { $ref: '#/components/schemas/RefAgence', nullable: true },
          equipe: { $ref: '#/components/schemas/RefEquipe', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      Prospect: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          nom: { type: 'string' },
          prenom: { type: 'string' },
          telephone: { type: 'string' },
          email: { type: 'string', nullable: true },
          statut: { type: 'string', enum: ['nouveau', 'contacte', 'interesse', 'negocie', 'converti', 'perdu'] },
          ville: { type: 'string', nullable: true },
          produit_interet: { $ref: '#/components/schemas/RefProduit', nullable: true },
          commercial: { $ref: '#/components/schemas/RefUser' },
          nb_pieces_jointes: { type: 'integer' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      Client: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          nom: { type: 'string' },
          prenom: { type: 'string' },
          telephone: { type: 'string' },
          email: { type: 'string' },
          statut: { type: 'string', enum: ['actif', 'inactif', 'blackliste'] },
          ville: { type: 'string', nullable: true },
          agence: { $ref: '#/components/schemas/RefAgence' },
          commercial: { $ref: '#/components/schemas/RefUser' },
          nb_comptes: { type: 'integer' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      Compte: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          numero: { type: 'string', example: 'CC-2025-00001' },
          produit: { $ref: '#/components/schemas/RefProduit' },
          solde: { type: 'number', example: 125000 },
          statut: { type: 'string', enum: ['actif', 'suspendu', 'clos'] },
          date_ouverture: { type: 'string', format: 'date' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      Transaction: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          type: { type: 'string', enum: ['credit', 'debit'] },
          montant: { type: 'number', example: 10000 },
          solde_avant: { type: 'number' },
          solde_apres: { type: 'number' },
          motif: { type: 'string', nullable: true },
          agent: { type: 'object' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      Agent: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          matricule: { type: 'string', example: 'AGT-001' },
          secteur: { type: 'string', nullable: true },
          latitude: { type: 'number', nullable: true },
          longitude: { type: 'number', nullable: true },
          derniere_position_at: { type: 'string', format: 'date-time', nullable: true },
          en_ligne: { type: 'boolean' },
          utilisateur: { $ref: '#/components/schemas/Utilisateur' },
        },
      },
      Objectif: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          titre: { type: 'string' },
          produit: { $ref: '#/components/schemas/RefProduit' },
          cible: { type: 'number' },
          realise: { type: 'number' },
          unite: { type: 'string', enum: ['clients', 'montant'] },
          periodicite: { type: 'string', enum: ['semaine', 'mois', 'trimestre'] },
          pourcentage: { type: 'number' },
          date_debut: { type: 'string', format: 'date' },
          date_fin: { type: 'string', format: 'date' },
          statut: { type: 'string', enum: ['en_cours', 'atteint', 'depasse', 'echec'] },
          assignation_type: { type: 'string', enum: ['equipe', 'agents'] },
        },
      },
      Log: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          timestamp: { type: 'string', format: 'date-time' },
          utilisateur: { type: 'object', nullable: true },
          agence: { $ref: '#/components/schemas/RefAgence', nullable: true },
          module: { type: 'string', enum: ['marketing', 'collecte', 'parametres', 'system'] },
          action: { type: 'string', example: 'CREATE_PROSPECT' },
          action_type: { type: 'string', example: 'CREATE' },
          entite_type: { type: 'string' },
          entite_id: { type: 'string' },
          description: { type: 'string', nullable: true },
          impact: { type: 'string', nullable: true },
        },
      },
      // Refs lightweight
      RefAgence: { type: 'object', properties: { id: { type: 'integer' }, nom: { type: 'string' } } },
      RefEquipe: { type: 'object', properties: { id: { type: 'integer' }, nom: { type: 'string' } } },
      RefUser: { type: 'object', properties: { id: { type: 'integer' }, prenom: { type: 'string' }, nom: { type: 'string' } } },
      RefProduit: { type: 'object', properties: { id: { type: 'integer' }, nom: { type: 'string' } } },
      RefGroupe: { type: 'object', properties: { id: { type: 'integer' }, nom: { type: 'string' }, couleur: { type: 'string' } } },
    },
    parameters: {
      Page: { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
      PerPage: { name: 'per_page', in: 'query', schema: { type: 'integer', default: 20 } },
      AgenceId: { name: 'agence_id', in: 'query', schema: { type: 'integer' } },
      Search: { name: 'search', in: 'query', schema: { type: 'string' } },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    // ─── AUTH ────────────────────────────────────────────────────────
    '/auth/login': {
      post: {
        tags: ['Auth'], summary: 'Connexion', security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email', example: 'admin@cecaw.cm' }, password: { type: 'string', example: 'Cecaw2025!' } } } } },
        },
        responses: {
          200: { description: 'Connexion réussie', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { access_token: { type: 'string' }, refresh_token: { type: 'string' }, token_type: { type: 'string' }, expires_in: { type: 'integer' }, user: { $ref: '#/components/schemas/Utilisateur' } } } } } } } },
          401: { description: 'Identifiants incorrects' },
          403: { description: 'Compte suspendu' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'], summary: 'Renouveler le token', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { refresh_token: { type: 'string' } } } } } },
        responses: { 200: { description: 'Nouveau access_token' }, 401: { description: 'Refresh token invalide' } },
      },
    },
    '/auth/logout': {
      post: { tags: ['Auth'], summary: 'Déconnexion', responses: { 200: { description: 'Déconnecté' } } },
    },
    '/auth/me': {
      get: { tags: ['Auth'], summary: 'Profil utilisateur connecté', responses: { 200: { description: 'Profil', content: { 'application/json': { schema: { $ref: '#/components/schemas/Utilisateur' } } } } } },
      put: {
        tags: ['Auth'], summary: 'Mettre à jour sa fonction',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { fonction: { type: 'string' } } } } } },
        responses: { 200: { description: 'Profil mis à jour' } },
      },
    },
    '/auth/me/password': {
      put: {
        tags: ['Auth'], summary: 'Changer son propre mot de passe',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['current_password', 'new_password', 'new_password_confirmation'], properties: { current_password: { type: 'string' }, new_password: { type: 'string', minLength: 6 }, new_password_confirmation: { type: 'string' } } } } } },
        responses: { 200: { description: 'Mot de passe mis à jour' }, 422: { description: 'Validation échouée' } },
      },
    },

    // ─── AGENCES ─────────────────────────────────────────────────────
    '/agences': {
      get: { tags: ['Agences'], summary: 'Liste des agences', parameters: [{ name: 'actif', in: 'query', schema: { type: 'boolean' } }, { $ref: '#/components/parameters/Search' }], responses: { 200: { description: 'Liste', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: { $ref: '#/components/schemas/Agence' } } } } } } } } },
      post: { tags: ['Agences'], summary: 'Créer une agence (admin/manager)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['nom', 'ville'], properties: { nom: { type: 'string' }, ville: { type: 'string' }, adresse: { type: 'string' }, actif: { type: 'boolean' } } } } } }, responses: { 201: { description: 'Agence créée' }, 403: { description: 'Accès refusé' } } },
    },
    '/agences/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: { tags: ['Agences'], summary: 'Détail agence', responses: { 200: { description: 'Agence' }, 404: { description: 'Introuvable' } } },
      put: { tags: ['Agences'], summary: 'Modifier agence', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Agence' } } } }, responses: { 200: { description: 'Modifié' } } },
      delete: { tags: ['Agences'], summary: 'Supprimer agence', responses: { 204: { description: 'Supprimé' }, 409: { description: 'Utilisateurs/équipes attachés' } } },
    },

    // ─── ÉQUIPES ──────────────────────────────────────────────────────
    '/equipes': {
      get: { tags: ['Équipes'], summary: 'Liste des équipes', parameters: [{ $ref: '#/components/parameters/AgenceId' }], responses: { 200: { description: 'Liste', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Equipe' } } } } } } } } },
      post: { tags: ['Équipes'], summary: 'Créer équipe', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['nom', 'agence_id'], properties: { nom: { type: 'string' }, agence_id: { type: 'integer' }, responsable_id: { type: 'integer' } } } } } }, responses: { 201: { description: 'Créée' } } },
    },
    '/equipes/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: { tags: ['Équipes'], summary: 'Détail équipe + membres', responses: { 200: { description: 'Équipe' } } },
      put: { tags: ['Équipes'], summary: 'Modifier équipe', requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Modifié' } } },
      delete: { tags: ['Équipes'], summary: 'Supprimer équipe', responses: { 204: { description: 'Supprimé' }, 409: { description: 'Membres attachés' } } },
    },

    // ─── GROUPES PRODUITS ─────────────────────────────────────────────
    '/groupes-produits': {
      get: { tags: ['Groupes Produits'], summary: 'Liste des groupes', responses: { 200: { description: 'Liste', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/GroupeProduit' } } } } } } } } },
      post: { tags: ['Groupes Produits'], summary: 'Créer groupe', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['nom'], properties: { nom: { type: 'string' }, description: { type: 'string' }, couleur: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$', example: '#10b981' } } } } } }, responses: { 201: { description: 'Créé' } } },
    },
    '/groupes-produits/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: { tags: ['Groupes Produits'], summary: 'Détail + produits', responses: { 200: { description: 'Groupe' } } },
      put: { tags: ['Groupes Produits'], summary: 'Modifier', requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Modifié' } } },
      delete: { tags: ['Groupes Produits'], summary: 'Supprimer', responses: { 204: { description: 'Supprimé' }, 409: { description: 'Produits attachés' } } },
    },

    // ─── PRODUITS ─────────────────────────────────────────────────────
    '/produits': {
      get: { tags: ['Produits'], summary: 'Liste des produits', parameters: [{ name: 'groupe_id', in: 'query', schema: { type: 'integer' } }, { name: 'actif', in: 'query', schema: { type: 'boolean' } }, { $ref: '#/components/parameters/Search' }], responses: { 200: { description: 'Liste', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Produit' } } } } } } } } },
      post: { tags: ['Produits'], summary: 'Créer produit', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['nom', 'groupe_id'], properties: { nom: { type: 'string' }, groupe_id: { type: 'integer' }, description: { type: 'string' }, actif: { type: 'boolean' } } } } } }, responses: { 201: { description: 'Créé' } } },
    },
    '/produits/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: { tags: ['Produits'], summary: 'Détail produit', responses: { 200: { description: 'Produit' } } },
      put: { tags: ['Produits'], summary: 'Modifier produit', requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Modifié' } } },
      delete: { tags: ['Produits'], summary: 'Supprimer produit', responses: { 204: { description: 'Supprimé' }, 409: { description: 'Produit utilisé dans des comptes ou objectifs' } } },
    },
    '/produits/{id}/toggle': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      patch: { tags: ['Produits'], summary: 'Activer/Désactiver produit', responses: { 200: { description: 'Statut basculé', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' }, actif: { type: 'boolean' } } } } } } } },
    },

    // ─── UTILISATEURS ─────────────────────────────────────────────────
    '/utilisateurs': {
      get: { tags: ['Utilisateurs'], summary: 'Liste des utilisateurs', parameters: [{ $ref: '#/components/parameters/AgenceId' }, { name: 'equipe_id', in: 'query', schema: { type: 'integer' } }, { name: 'role', in: 'query', schema: { type: 'string', enum: ['admin', 'manager', 'backoffice', 'agent'] } }, { name: 'fonction', in: 'query', schema: { type: 'string' } }, { $ref: '#/components/parameters/Search' }, { $ref: '#/components/parameters/Page' }, { $ref: '#/components/parameters/PerPage' }], responses: { 200: { description: 'Liste paginée', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Utilisateur' } }, meta: { $ref: '#/components/schemas/Meta' } } } } } } } },
      post: { tags: ['Utilisateurs'], summary: 'Créer utilisateur (admin/manager)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['nom', 'prenom', 'email', 'role', 'agence_id'], properties: { nom: { type: 'string' }, prenom: { type: 'string' }, email: { type: 'string', format: 'email' }, role: { type: 'string', enum: ['admin', 'manager', 'backoffice', 'agent'] }, fonction: { type: 'string' }, agence_id: { type: 'integer' }, equipe_id: { type: 'integer' }, actif: { type: 'boolean' } } } } } }, responses: { 201: { description: 'Créé — inclut mot_de_passe_initial dans meta' } } },
    },
    '/utilisateurs/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: { tags: ['Utilisateurs'], summary: 'Détail utilisateur', responses: { 200: { description: 'Utilisateur' } } },
      put: { tags: ['Utilisateurs'], summary: 'Modifier utilisateur', requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Modifié' } } },
      delete: { tags: ['Utilisateurs'], summary: 'Supprimer utilisateur (admin)', responses: { 204: { description: 'Supprimé' }, 409: { description: 'Prospects/clients liés — désactiver plutôt' } } },
    },
    '/utilisateurs/{id}/toggle': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      patch: { tags: ['Utilisateurs'], summary: 'Activer/Suspendre compte', responses: { 200: { description: 'Statut basculé' } } },
    },
    '/utilisateurs/{id}/reset-password': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      post: { tags: ['Utilisateurs'], summary: 'Réinitialiser MDP au défaut (admin)', responses: { 200: { description: 'MDP réinitialisé', content: { 'application/json': { schema: { type: 'object', properties: { meta: { type: 'object', properties: { nouveau_mot_de_passe: { type: 'string' } } } } } } } } } },
    },
    '/utilisateurs/{id}/password': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      put: { tags: ['Utilisateurs'], summary: 'Changer MDP utilisateur (admin)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { new_password: { type: 'string', minLength: 6 }, new_password_confirmation: { type: 'string' } } } } } }, responses: { 200: { description: 'MDP mis à jour' } } },
    },

    // ─── PROSPECTS ────────────────────────────────────────────────────
    '/prospects': {
      get: { tags: ['Prospects'], summary: 'Liste des prospects', parameters: [{ name: 'statut', in: 'query', schema: { type: 'string', enum: ['nouveau', 'contacte', 'interesse', 'negocie', 'converti', 'perdu'] } }, { name: 'commercial_id', in: 'query', schema: { type: 'integer' } }, { $ref: '#/components/parameters/AgenceId' }, { name: 'produit_interet_id', in: 'query', schema: { type: 'integer' } }, { $ref: '#/components/parameters/Search' }, { name: 'date_debut', in: 'query', schema: { type: 'string', format: 'date' } }, { name: 'date_fin', in: 'query', schema: { type: 'string', format: 'date' } }, { $ref: '#/components/parameters/Page' }, { $ref: '#/components/parameters/PerPage' }], responses: { 200: { description: 'Liste paginée', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Prospect' } }, meta: { $ref: '#/components/schemas/Meta' } } } } } } } },
      post: { tags: ['Prospects'], summary: 'Créer un prospect', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['nom', 'prenom', 'telephone'], properties: { nom: { type: 'string' }, prenom: { type: 'string' }, telephone: { type: 'string' }, email: { type: 'string', format: 'email' }, genre: { type: 'string', enum: ['M', 'F', ''] }, ville: { type: 'string' }, statut: { type: 'string', enum: ['nouveau', 'contacte', 'interesse', 'negocie', 'converti', 'perdu'] }, produit_interet_id: { type: 'integer' }, commercial_id: { type: 'integer' }, notes: { type: 'string' }, latitude: { type: 'number' }, longitude: { type: 'number' } } } } } }, responses: { 201: { description: 'Prospect créé' } } },
    },
    '/prospects/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: { tags: ['Prospects'], summary: 'Détail prospect + pièces jointes', responses: { 200: { description: 'Prospect complet' } } },
      put: { tags: ['Prospects'], summary: 'Modifier prospect', requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Modifié' } } },
      delete: { tags: ['Prospects'], summary: 'Supprimer prospect', responses: { 204: { description: 'Supprimé' } } },
    },
    '/prospects/{id}/statut': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      patch: {
        tags: ['Prospects'], summary: 'Changer le statut pipeline',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { statut: { type: 'string', enum: ['nouveau', 'contacte', 'interesse', 'negocie', 'converti', 'perdu'] } } } } } },
        responses: { 200: { description: 'Statut mis à jour. Si converti → client_cree inclus dans la réponse.' }, 422: { description: 'Transition non autorisée' } },
      },
    },
    '/prospects/{id}/pieces-jointes': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      post: { tags: ['Prospects'], summary: 'Upload pièce jointe', requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { intitule: { type: 'string' }, fichier: { type: 'string', format: 'binary' } } } } } }, responses: { 201: { description: 'Fichier uploadé' } } },
    },
    '/prospects/{id}/pieces-jointes/{pj_id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }, { name: 'pj_id', in: 'path', required: true, schema: { type: 'integer' } }],
      delete: { tags: ['Prospects'], summary: 'Supprimer pièce jointe', responses: { 204: { description: 'Supprimée' } } },
    },

    // ─── CLIENTS ──────────────────────────────────────────────────────
    '/clients': {
      get: { tags: ['Clients'], summary: 'Liste des clients', parameters: [{ name: 'statut', in: 'query', schema: { type: 'string', enum: ['actif', 'inactif', 'blackliste'] } }, { $ref: '#/components/parameters/AgenceId' }, { name: 'commercial_id', in: 'query', schema: { type: 'integer' } }, { $ref: '#/components/parameters/Search' }, { $ref: '#/components/parameters/Page' }, { $ref: '#/components/parameters/PerPage' }], responses: { 200: { description: 'Liste paginée' } } },
      post: { tags: ['Clients'], summary: 'Créer client manuellement', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['nom', 'prenom', 'telephone', 'agence_id'], properties: { nom: { type: 'string' }, prenom: { type: 'string' }, telephone: { type: 'string' }, email: { type: 'string' }, adresse: { type: 'string' }, agence_id: { type: 'integer' }, commercial_id: { type: 'integer' }, statut: { type: 'string' }, prospect_id: { type: 'integer', nullable: true } } } } } }, responses: { 201: { description: 'Client créé' } } },
    },
    '/clients/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: { tags: ['Clients'], summary: 'Détail client + comptes + pièces jointes', responses: { 200: { description: 'Client complet' } } },
      put: { tags: ['Clients'], summary: 'Modifier client', requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Modifié' } } },
      delete: { tags: ['Clients'], summary: 'Supprimer client', responses: { 204: { description: 'Supprimé' }, 409: { description: 'Comptes actifs existants' } } },
    },
    '/clients/{id}/statut': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      patch: { tags: ['Clients'], summary: 'Changer statut client', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { statut: { type: 'string', enum: ['actif', 'inactif', 'blackliste'] } } } } } }, responses: { 200: { description: 'Statut mis à jour' } } },
    },
    '/clients/{client_id}/comptes': {
      parameters: [{ name: 'client_id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: { tags: ['Comptes'], summary: 'Liste des comptes d\'un client', responses: { 200: { description: 'Comptes', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Compte' } } } } } } } } },
      post: { tags: ['Comptes'], summary: 'Ouvrir un compte', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['produit_id'], properties: { produit_id: { type: 'integer' }, solde_initial: { type: 'number' }, date_ouverture: { type: 'string', format: 'date' } } } } } }, responses: { 201: { description: 'Compte créé — numéro CC-YYYY-NNNNN généré automatiquement' } } },
    },

    // ─── COMPTES ──────────────────────────────────────────────────────
    '/comptes/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: { tags: ['Comptes'], summary: 'Détail compte + 10 dernières transactions', responses: { 200: { description: 'Compte' } } },
    },
    '/comptes/{id}/statut': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      patch: { tags: ['Comptes'], summary: 'Changer statut compte', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { statut: { type: 'string', enum: ['actif', 'suspendu', 'clos'] } } } } } }, responses: { 200: { description: 'Statut mis à jour' } } },
    },
    '/comptes/{compte_id}/transactions': {
      parameters: [{ name: 'compte_id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: { tags: ['Transactions'], summary: 'Historique des transactions', parameters: [{ name: 'type', in: 'query', schema: { type: 'string', enum: ['credit', 'debit'] } }, { name: 'date_debut', in: 'query', schema: { type: 'string', format: 'date' } }, { name: 'date_fin', in: 'query', schema: { type: 'string', format: 'date' } }, { $ref: '#/components/parameters/Page' }, { $ref: '#/components/parameters/PerPage' }], responses: { 200: { description: 'Transactions paginées' } } },
      post: {
        tags: ['Transactions'], summary: 'Enregistrer une transaction',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['type', 'montant', 'agent_id'], properties: { type: { type: 'string', enum: ['credit', 'debit'] }, montant: { type: 'number', minimum: 0.01 }, motif: { type: 'string' }, agent_id: { type: 'integer' } } } } } },
        responses: { 201: { description: 'Transaction enregistrée — solde mis à jour atomiquement' }, 422: { description: 'Solde insuffisant pour un débit' } },
      },
    },

    // ─── AGENTS ───────────────────────────────────────────────────────
    '/agents': {
      get: { tags: ['Agents'], summary: 'Liste des agents', parameters: [{ $ref: '#/components/parameters/AgenceId' }, { name: 'statut_gps', in: 'query', schema: { type: 'string', enum: ['online', 'offline'] }, description: 'online = dernière position < 60 min' }, { $ref: '#/components/parameters/Search' }, { $ref: '#/components/parameters/Page' }, { $ref: '#/components/parameters/PerPage' }], responses: { 200: { description: 'Agents', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Agent' } }, meta: { $ref: '#/components/schemas/Meta' } } } } } } } },
      post: { tags: ['Agents'], summary: 'Créer profil agent', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['utilisateur_id', 'matricule'], properties: { utilisateur_id: { type: 'integer' }, matricule: { type: 'string', example: 'AGT-088' }, secteur: { type: 'string' } } } } } }, responses: { 201: { description: 'Agent créé' } } },
    },
    '/agents/terrain': {
      get: { tags: ['Agents'], summary: 'Agents avec position GPS (vue carte)', parameters: [{ $ref: '#/components/parameters/AgenceId' }], responses: { 200: { description: 'Positions GPS de tous les agents' } } },
    },
    '/agents/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: { tags: ['Agents'], summary: 'Détail agent + transactions récentes + objectifs', responses: { 200: { description: 'Agent' } } },
      put: { tags: ['Agents'], summary: 'Modifier agent', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { matricule: { type: 'string' }, secteur: { type: 'string' } } } } } }, responses: { 200: { description: 'Modifié' } } },
      delete: { tags: ['Agents'], summary: 'Supprimer agent', responses: { 204: { description: 'Supprimé' }, 409: { description: 'Transactions existantes' } } },
    },
    '/agents/{id}/position': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      patch: { tags: ['Agents'], summary: 'Mettre à jour position GPS + broadcast WebSocket', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['latitude', 'longitude'], properties: { latitude: { type: 'number' }, longitude: { type: 'number' } } } } } }, responses: { 200: { description: 'Position mise à jour' } } },
    },

    // ─── OBJECTIFS ────────────────────────────────────────────────────
    '/objectifs': {
      get: { tags: ['Objectifs'], summary: 'Liste des objectifs', parameters: [{ name: 'statut', in: 'query', schema: { type: 'string', enum: ['en_cours', 'atteint', 'depasse', 'echec'] } }, { name: 'assignation_type', in: 'query', schema: { type: 'string', enum: ['equipe', 'agents'] } }, { name: 'equipe_id', in: 'query', schema: { type: 'integer' } }, { name: 'agent_id', in: 'query', schema: { type: 'integer' } }, { $ref: '#/components/parameters/Page' }, { $ref: '#/components/parameters/PerPage' }], responses: { 200: { description: 'Liste + pourcentage calculé' } } },
      post: { tags: ['Objectifs'], summary: 'Créer objectif (admin/manager)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['titre', 'produit_id', 'cible', 'unite', 'periodicite', 'date_debut', 'date_fin', 'assignation_type'], properties: { titre: { type: 'string' }, produit_id: { type: 'integer' }, cible: { type: 'number' }, unite: { type: 'string', enum: ['clients', 'montant'] }, periodicite: { type: 'string', enum: ['semaine', 'mois', 'trimestre'] }, date_debut: { type: 'string', format: 'date' }, date_fin: { type: 'string', format: 'date' }, assignation_type: { type: 'string', enum: ['equipe', 'agents'] }, equipe_id: { type: 'integer' }, agent_ids: { type: 'array', items: { type: 'integer' } } } } } } }, responses: { 201: { description: 'Objectif créé' } } },
    },
    '/objectifs/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: { tags: ['Objectifs'], summary: 'Détail objectif', responses: { 200: { description: 'Objectif' } } },
      put: { tags: ['Objectifs'], summary: 'Modifier objectif', requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Modifié' } } },
      delete: { tags: ['Objectifs'], summary: 'Supprimer objectif', responses: { 204: { description: 'Supprimé' } } },
    },
    '/objectifs/{id}/realise': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      patch: { tags: ['Objectifs'], summary: 'Mettre à jour l\'avancement (recalcule statut)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { realise: { type: 'number', minimum: 0 } } } } } }, responses: { 200: { description: 'Avancement + statut recalculé automatiquement' } } },
    },

    // ─── STATISTIQUES ─────────────────────────────────────────────────
    '/stats/kpis': {
      get: { tags: ['Statistiques'], summary: 'KPIs globaux', parameters: [{ $ref: '#/components/parameters/AgenceId' }, { name: 'periode', in: 'query', schema: { type: 'string', enum: ['7j', '30j', 'mois', 'trimestre', 'annee', 'tout'] } }], responses: { 200: { description: 'KPIs agrégés' } } },
    },
    '/stats/performances/individuelles': {
      get: { tags: ['Statistiques'], summary: 'Performances par agent', parameters: [{ $ref: '#/components/parameters/AgenceId' }, { name: 'periode', in: 'query', schema: { type: 'string' } }, { name: 'sort', in: 'query', schema: { type: 'string', enum: ['nom', 'prospects', 'convertis', 'clients', 'collecte', 'taux'] } }, { name: 'dir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } }, { $ref: '#/components/parameters/Page' }, { $ref: '#/components/parameters/PerPage' }], responses: { 200: { description: 'Performances individuelles' } } },
    },
    '/stats/performances/equipes': {
      get: { tags: ['Statistiques'], summary: 'Performances par équipe', parameters: [{ $ref: '#/components/parameters/AgenceId' }, { name: 'periode', in: 'query', schema: { type: 'string' } }, { $ref: '#/components/parameters/Page' }, { $ref: '#/components/parameters/PerPage' }], responses: { 200: { description: 'Performances équipes' } } },
    },
    '/stats/transactions/par-mois': {
      get: { tags: ['Statistiques'], summary: 'Crédits/débits par mois (graphique)', parameters: [{ $ref: '#/components/parameters/AgenceId' }, { name: 'nb_mois', in: 'query', schema: { type: 'integer', default: 6 } }], responses: { 200: { description: 'Données graphique barres' } } },
    },
    '/stats/prospects/par-statut': {
      get: { tags: ['Statistiques'], summary: 'Répartition prospects par statut (camembert)', parameters: [{ $ref: '#/components/parameters/AgenceId' }], responses: { 200: { description: 'Données graphique donut' } } },
    },

    // ─── JOURNAL ──────────────────────────────────────────────────────
    '/logs': {
      get: { tags: ['Journal'], summary: "Journal d'activité (admin/manager)", parameters: [{ $ref: '#/components/parameters/AgenceId' }, { name: 'utilisateur_id', in: 'query', schema: { type: 'integer' } }, { name: 'module', in: 'query', schema: { type: 'string', enum: ['marketing', 'collecte', 'parametres', 'system'] } }, { name: 'action_type', in: 'query', schema: { type: 'string', enum: ['CREATE', 'UPDATE', 'DELETE', 'RESET', 'CHANGE', 'CONVERT', 'LOGIN', 'LOGOUT'] } }, { name: 'date_debut', in: 'query', schema: { type: 'string', format: 'date' } }, { name: 'date_fin', in: 'query', schema: { type: 'string', format: 'date' } }, { $ref: '#/components/parameters/Page' }, { $ref: '#/components/parameters/PerPage' }], responses: { 200: { description: 'Logs paginés', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Log' } }, meta: { $ref: '#/components/schemas/Meta' } } } } } } } },
    },

    // ─── DASHBOARD ────────────────────────────────────────────────────
    '/dashboard': {
      get: { tags: ['Dashboard'], summary: 'Données complètes du tableau de bord', description: 'Agrège KPIs + graphiques pour la page d\'accueil. Filtrage automatique par agence pour les non-admin.', responses: { 200: { description: 'Dashboard complet' } } },
    },
  },
};
