/* Ally — profils métier.
   Chaque métier apporte son vocabulaire, ses niveaux d'autonomie, son script
   d'accueil et son propre jeu de données : un artisan voit des demandes de
   devis et des chantiers, pas des audiences. */
window.ALLY_PROFILES = {

  /* ============================== AVOCAT ============================== */
  avocat: {
    name: 'Avocat',
    title: 'Maître',
    secret: true,
    orgLabel: 'Cabinet',
    orgPlaceholder: 'Cabinet Dubois & Associés',
    clientWord: 'client',
    desc: 'Vocabulaire procédural, appels du greffe, confidentialité renforcée.',
    plan: 'Pilote Avocats',
    autonomy: { calls: 70, emails: 25, agenda: 85 },
    greeting: function (p) {
      return p.org + ', bonjour. Je suis Ally, l\'assistante du cabinet. '
        + 'Comment puis-je vous aider aujourd\'hui ?';
    },
    quota: { calls: [142, 200], emails: [88, 150] },

    calls: [
      { id: 1, caller: 'Mme Aubert', time: '09:12', duration: '2 min 40', status: "Traité par l'IA", kind: 'ok',
        subject: 'Report de rendez-vous',
        transcript: "Demande de report du rendez-vous du jeudi 30 au vendredi 31 juillet, motif : conflit d'agenda. Nouveau créneau confirmé à 14h." },
      { id: 2, caller: 'M. Lefebvre', time: '10:42', duration: '1 min 05', status: 'Transféré (urgence)', kind: 'urgent',
        subject: 'Audience demain',
        transcript: "Urgence liée à une audience du lendemain. Transféré immédiatement sur votre portable selon la règle « urgences »." },
      { id: 3, caller: 'Sté Meridian', time: '11:20', duration: '3 min 12', status: "Traité par l'IA", kind: 'ok',
        subject: 'Tarifs consultation',
        transcript: 'Question sur les tarifs de consultation initiale. Réponse fournie depuis la base de connaissances du cabinet.' },
      { id: 4, caller: 'Numéro masqué', time: '14:05', duration: '0 min 48', status: 'En attente de rappel', kind: 'pending',
        subject: 'Appel sans suite',
        transcript: "Appel raccroché après le message d'accueil, aucune demande identifiée. Rappel programmé." }
    ],
    drafts: [
      { id: 1, subject: 'Confirmation de rendez-vous', to: 'aubert@email.fr', category: 'RDV', time: '09:14',
        preview: 'Nous vous confirmons votre nouveau rendez-vous le vendredi 31 juillet à 14h...' },
      { id: 2, subject: 'Réponse à votre demande de renseignements', to: 'contact@meridian.fr', category: 'Nouveau client', time: '11:25',
        preview: 'Merci pour votre message. Concernant votre dossier, nous vous proposons...' },
      { id: 3, subject: 'Suivi de dossier — relance', to: 'petit.j@email.fr', category: 'Question générale', time: 'Hier 16:40',
        preview: 'Faisant suite à notre échange, veuillez trouver ci-joint les éléments demandés...' }
    ],
    sent: [
      { id: 1, subject: 'Accusé de réception — dossier #4521', to: 'greffe@tj-lyon.fr', time: 'Hier 18:32' },
      { id: 2, subject: 'Rappel de rendez-vous — demain 10h', to: 'chevalier@email.fr', time: 'Hier 09:00' },
      { id: 3, subject: "Confirmation d'annulation", to: 'roussel.m@email.fr', time: 'Lundi 16:14' }
    ],
    rdv: [
      { id: 1, day: 'Auj.',   client: 'Mme Aubert',   type: 'Consultation',          time: '14:00' },
      { id: 2, day: 'Auj.',   client: 'M. Chevalier', type: 'Suivi de dossier',      time: '16:30' },
      { id: 3, day: 'Jeu 30', client: 'Sté Meridian', type: 'Première consultation', time: '09:30' },
      { id: 4, day: 'Ven 31', client: 'M. Petit',     type: 'Suivi de dossier',      time: '14:00' },
      { id: 5, day: 'Lun 03', client: 'Mme Roussel',  type: 'Consultation',          time: '11:00' }
    ],
    agendaRules: 'Fermé les jours fériés, absences déclarées et le mercredi après-midi.',
    agendaLast: 'RDV de M. Petit déplacé au 31/07 à 14h.',
    faq: [
      { id: 1, q: 'Horaires du cabinet',         a: 'Lundi au vendredi, 9h - 18h30. Fermé le mercredi après-midi.' },
      { id: 2, q: 'Tarif consultation initiale', a: '120 € TTC, 45 minutes.' },
      { id: 3, q: "Domaines d'intervention",     a: 'Droit du travail et droit des affaires, tribunal judiciaire de Lyon.' },
      { id: 4, q: 'Documents à apporter',        a: "Pièce d'identité et l'ensemble des documents liés au dossier." }
    ],
    contacts: [
      { id: 1, name: 'Votre portable',                  reason: 'Urgences procédurales' },
      { id: 2, name: 'Tribunal judiciaire',             reason: 'Appels du greffe' },
      { id: 3, name: 'Assurance protection juridique',  reason: 'Dossiers en cours' }
    ],
    voiceLog: [
      { id: 1, order: 'Déplace mon rdv de 14h à demain même heure', when: "Aujourd'hui 08:54",
        result: 'RDV Mme Aubert déplacé au 29/07 14:00', state: 'done' },
      { id: 2, order: 'Bloque mon agenda vendredi après-midi', when: 'Hier 19:12',
        result: 'Créneau 31/07 14:00-18:30 marqué indisponible', state: 'done' },
      { id: 3, order: 'Envoie un mail à Mme Dupont pour confirmer jeudi', when: 'Hier 17:05',
        result: 'Brouillon préparé, en attente de validation', state: 'wait' }
    ],
    voiceDemo: [
      { heard: 'Ally, déplace mon rendez-vous de 14h à demain même heure.',
        confirm: 'Vous voulez bien que je déplace le rendez-vous de Mme Aubert à demain 14h ?',
        reply: "C'est fait, votre rendez-vous de 14h avec Mme Aubert est déplacé à demain 14h." },
      { heard: 'Ally, bloque mon agenda vendredi après-midi.', confirm: null,
        reply: 'Vendredi après-midi est bloqué, aucun rendez-vous ne sera proposé sur ce créneau.' },
      { heard: 'Ally, envoie un mail à Mme Dupont pour confirmer le rendez-vous de jeudi.',
        confirm: "Envoyer un email de confirmation à Mme Dupont pour jeudi, c'est confirmé ?",
        reply: 'Le brouillon est prêt dans vos emails à valider — votre profil interdit un envoi direct.' }
    ],
    stats: { saved: '6h20', avoided: 27, validated: 14 }
  },

  /* ============================== MÉDECIN ============================== */
  medecin: {
    name: 'Médecin',
    title: 'Docteur',
    secret: true,
    orgLabel: 'Cabinet',
    orgPlaceholder: 'Cabinet des Lilas',
    clientWord: 'patient',
    desc: 'Motifs de consultation, tri des urgences, secret médical.',
    plan: 'Pilote Santé',
    autonomy: { calls: 75, emails: 20, agenda: 80 },
    greeting: function (p) {
      return p.org + ', bonjour. Je suis Ally, l\'assistante du cabinet. '
        + 'Quel est le motif de votre appel ?';
    },
    quota: { calls: [268, 400], emails: [61, 150] },

    calls: [
      { id: 1, caller: 'Mme Fontaine', time: '08:35', duration: '1 min 52', status: "Traité par l'IA", kind: 'ok',
        subject: 'Renouvellement d\'ordonnance',
        transcript: 'Demande de renouvellement de traitement chronique. Rendez-vous de contrôle proposé et accepté pour jeudi 09:00.' },
      { id: 2, caller: 'M. Bassène', time: '09:47', duration: '0 min 58', status: 'Transféré (urgence)', kind: 'urgent',
        subject: 'Douleur thoracique',
        transcript: "Symptômes évoquant une urgence. Ally n'a posé aucun diagnostic et vous a transféré l'appel immédiatement, avec rappel du 15." },
      { id: 3, caller: 'Mme Kaci', time: '10:15', duration: '2 min 20', status: "Traité par l'IA", kind: 'ok',
        subject: 'Horaires et tarifs',
        transcript: 'Question sur les horaires et le tarif de consultation. Réponse fournie depuis la base de connaissances.' },
      { id: 4, caller: 'Laboratoire Vialis', time: '11:30', duration: '1 min 12', status: 'En attente de rappel', kind: 'pending',
        subject: 'Résultats d\'analyses',
        transcript: 'Le laboratoire souhaite vous transmettre des résultats. Aucune donnée médicale collectée par Ally, rappel programmé.' }
    ],
    drafts: [
      { id: 1, subject: 'Confirmation de consultation', to: 'fontaine@email.fr', category: 'RDV', time: '08:37',
        preview: 'Nous vous confirmons votre consultation du jeudi 30 juillet à 09h00...' },
      { id: 2, subject: 'Votre demande de renseignements', to: 'kaci.s@email.fr', category: 'Nouveau patient', time: '10:20',
        preview: 'Merci de votre appel. Le cabinet accepte de nouveaux patients à partir de...' },
      { id: 3, subject: 'Rappel — document à apporter', to: 'morvan.l@email.fr', category: 'Question générale', time: 'Hier 15:10',
        preview: 'Merci de prévoir votre carte vitale et votre courrier d\'adressage...' }
    ],
    sent: [
      { id: 1, subject: 'Rappel de consultation — demain 08h30', to: 'fontaine@email.fr', time: 'Hier 18:00' },
      { id: 2, subject: 'Accusé de réception de votre message', to: 'vialis@labo.fr', time: 'Hier 11:35' },
      { id: 3, subject: "Confirmation d'annulation", to: 'morvan.l@email.fr', time: 'Lundi 14:22' }
    ],
    rdv: [
      { id: 1, day: 'Auj.',   client: 'Mme Fontaine', type: 'Suivi chronique',      time: '14:00' },
      { id: 2, day: 'Auj.',   client: 'M. Ferrand',   type: 'Consultation',         time: '15:30' },
      { id: 3, day: 'Jeu 30', client: 'Mme Kaci',     type: 'Première consultation', time: '09:00' },
      { id: 4, day: 'Ven 31', client: 'Enfant Morvan', type: 'Vaccination',         time: '11:15' },
      { id: 5, day: 'Lun 03', client: 'M. Bassène',   type: 'Contrôle',             time: '10:00' }
    ],
    agendaRules: 'Fermé les jours fériés et le samedi. Créneaux d\'urgence réservés de 08h à 09h.',
    agendaLast: 'Consultation de Mme Kaci avancée au 30/07 à 09h00.',
    faq: [
      { id: 1, q: 'Horaires du cabinet',      a: 'Lundi au vendredi, 8h - 19h. Fermé le samedi.' },
      { id: 2, q: 'Tarif de consultation',    a: '30 €, secteur 1, carte vitale acceptée.' },
      { id: 3, q: 'Nouveaux patients',        a: 'Le cabinet accepte de nouveaux patients sur adressage.' },
      { id: 4, q: 'Que faire en cas d\'urgence', a: 'Composer le 15. Ally transfère systématiquement les urgences.' }
    ],
    contacts: [
      { id: 1, name: 'Votre portable',        reason: 'Urgences médicales' },
      { id: 2, name: 'Laboratoire Vialis',    reason: 'Résultats d\'analyses' },
      { id: 3, name: 'Médecin remplaçant',    reason: 'Absences et gardes' }
    ],
    voiceLog: [
      { id: 1, order: 'Ajoute un créneau d\'urgence demain à 8h', when: "Aujourd'hui 07:40",
        result: 'Créneau 29/07 08:00 ouvert en urgence', state: 'done' },
      { id: 2, order: 'Bloque mon agenda vendredi après-midi', when: 'Hier 19:30',
        result: 'Créneau 31/07 14:00-19:00 marqué indisponible', state: 'done' },
      { id: 3, order: 'Envoie les consignes de préparation à Mme Kaci', when: 'Hier 16:12',
        result: 'Brouillon préparé, en attente de validation', state: 'wait' }
    ],
    voiceDemo: [
      { heard: 'Ally, ajoute un créneau d\'urgence demain à 8 heures.', confirm: null,
        reply: "C'est fait, un créneau d'urgence est ouvert demain à 08h00." },
      { heard: 'Ally, envoie les consignes de préparation à Mme Kaci.',
        confirm: 'Envoyer les consignes de préparation à Mme Kaci, vous confirmez ?',
        reply: 'Le brouillon est prêt dans vos emails à valider — le secret médical interdit un envoi direct.' },
      { heard: 'Ally, décale ma consultation de 15h30 à jeudi.',
        confirm: 'Vous voulez bien que je déplace la consultation de M. Ferrand à jeudi 15h30 ?',
        reply: 'La consultation de M. Ferrand est déplacée à jeudi 15h30.' }
    ],
    stats: { saved: '9h10', avoided: 46, validated: 21 }
  },

  /* ============================== ARTISAN ============================== */
  artisan: {
    name: 'Artisan',
    title: '',
    secret: false,
    orgLabel: 'Entreprise',
    orgPlaceholder: 'Morel Rénovation',
    clientWord: 'client',
    desc: 'Demandes de devis, planification de chantier, disponibilités terrain.',
    plan: 'Pilote Artisans',
    autonomy: { calls: 85, emails: 65, agenda: 90 },
    greeting: function (p) {
      return p.org + ', bonjour. Je suis Ally, l\'assistante. '
        + 'Vous appelez pour un devis ou un chantier en cours ?';
    },
    quota: { calls: [96, 150], emails: [104, 150] },

    calls: [
      { id: 1, caller: 'M. Renaud', time: '07:48', duration: '3 min 05', status: "Traité par l'IA", kind: 'ok',
        subject: 'Demande de devis salle de bain',
        transcript: 'Rénovation complète de salle de bain, 6 m², à Villeurbanne. Visite technique proposée et fixée au vendredi 31 à 08h00.' },
      { id: 2, caller: 'Syndic Bellecour', time: '09:20', duration: '1 min 30', status: 'Transféré (urgence)', kind: 'urgent',
        subject: 'Fuite en cours',
        transcript: 'Fuite active dans un immeuble en gestion. Transféré immédiatement sur votre portable selon la règle « urgences ».' },
      { id: 3, caller: 'Mme Ollivier', time: '11:05', duration: '2 min 12', status: "Traité par l'IA", kind: 'ok',
        subject: 'Délai et zone d\'intervention',
        transcript: 'Question sur les délais et la zone couverte. Réponse fournie depuis la base de connaissances.' },
      { id: 4, caller: 'Fournisseur Batico', time: '15:40', duration: '0 min 55', status: 'En attente de rappel', kind: 'pending',
        subject: 'Livraison décalée',
        transcript: 'Le fournisseur signale un décalage de livraison. Rappel programmé, chantier Renaud potentiellement impacté.' }
    ],
    drafts: [
      { id: 1, subject: 'Devis rénovation salle de bain', to: 'renaud.p@email.fr', category: 'Devis', time: '07:52',
        preview: 'Suite à notre échange, voici le récapitulatif avant visite technique du vendredi 31 à 08h00...' },
      { id: 2, subject: 'Planification de votre chantier', to: 'contact@syndic-bellecour.fr', category: 'Chantier', time: '09:30',
        preview: 'Nous intervenons en urgence ce jour. Voici le créneau retenu et les accès nécessaires...' },
      { id: 3, subject: 'Réponse à votre demande', to: 'ollivier.c@email.fr', category: 'Nouveau client', time: '11:10',
        preview: 'Merci de votre appel. Nous intervenons sur Lyon et sa périphérie sous 15 jours...' }
    ],
    sent: [
      { id: 1, subject: 'Confirmation de visite technique — vendredi 08h', to: 'renaud.p@email.fr', time: 'Hier 18:10' },
      { id: 2, subject: 'Accusé de réception de votre demande', to: 'ollivier.c@email.fr', time: 'Hier 11:12' },
      { id: 3, subject: 'Rappel — intervention demain 07h30', to: 'contact@syndic-bellecour.fr', time: 'Lundi 17:45' }
    ],
    rdv: [
      { id: 1, day: 'Auj.',   client: 'Syndic Bellecour', type: 'Intervention urgence', time: '13:30' },
      { id: 2, day: 'Auj.',   client: 'Chantier Lavoisier', type: 'Pose carrelage',     time: '15:00' },
      { id: 3, day: 'Jeu 30', client: 'Mme Ollivier',    type: 'Visite technique',     time: '08:30' },
      { id: 4, day: 'Ven 31', client: 'M. Renaud',       type: 'Visite technique',     time: '08:00' },
      { id: 5, day: 'Lun 03', client: 'Chantier Guillon', type: 'Début de chantier',    time: '07:30' }
    ],
    agendaRules: 'Sur chantier du lundi au vendredi 7h30-17h. Devis et visites le matin uniquement.',
    agendaLast: 'Visite technique de Mme Ollivier avancée au 30/07 à 08h30.',
    faq: [
      { id: 1, q: "Zone d'intervention",   a: 'Lyon et périphérie, jusqu\'à 30 km.' },
      { id: 2, q: 'Devis',                 a: 'Gratuit, sous 48h après visite technique.' },
      { id: 3, q: 'Délai moyen',           a: 'Environ 15 jours avant début de chantier.' },
      { id: 4, q: 'Garanties',             a: 'Décennale et garantie de parfait achèvement.' }
    ],
    contacts: [
      { id: 1, name: 'Votre portable',       reason: 'Fuites et urgences chantier' },
      { id: 2, name: 'Syndic Bellecour',     reason: 'Client sous contrat' },
      { id: 3, name: 'Fournisseur Batico',   reason: 'Ruptures de livraison' }
    ],
    voiceLog: [
      { id: 1, order: 'Décale le chantier Guillon à lundi 7h30', when: "Aujourd'hui 06:55",
        result: 'Chantier Guillon déplacé au 03/08 07:30', state: 'done' },
      { id: 2, order: 'Envoie le devis à M. Renaud', when: 'Hier 18:05',
        result: 'Devis envoyé automatiquement', state: 'done' },
      { id: 3, order: 'Bloque vendredi après-midi, je suis en livraison', when: 'Hier 12:40',
        result: 'Créneau 31/07 13:00-17:00 marqué indisponible', state: 'done' }
    ],
    voiceDemo: [
      { heard: 'Ally, envoie le devis à M. Renaud.', confirm: null,
        reply: "C'est envoyé, M. Renaud a reçu son devis de rénovation de salle de bain." },
      { heard: 'Ally, décale le chantier Guillon à lundi 7h30.',
        confirm: 'Vous voulez bien que je déplace le chantier Guillon à lundi 07h30 ?',
        reply: 'Le chantier Guillon est déplacé à lundi 07h30, le client est prévenu.' },
      { heard: 'Ally, bloque vendredi après-midi, je suis en livraison.', confirm: null,
        reply: 'Vendredi après-midi est bloqué, aucune visite ne sera proposée sur ce créneau.' }
    ],
    stats: { saved: '7h45', avoided: 31, validated: 9 }
  },

  /* ============================ CONSULTANT ============================ */
  consultant: {
    name: 'Consultant',
    title: '',
    secret: false,
    orgLabel: 'Structure',
    orgPlaceholder: 'Perrin Conseil',
    clientWord: 'client',
    desc: 'Qualification des demandes entrantes, rendez-vous commerciaux.',
    plan: 'Pilote Conseil',
    autonomy: { calls: 80, emails: 55, agenda: 90 },
    greeting: function (p) {
      return p.org + ', bonjour. Je suis Ally, l\'assistante. Comment puis-je vous orienter ?';
    },
    quota: { calls: [58, 100], emails: [122, 200] },

    calls: [
      { id: 1, caller: 'Sté Novaris', time: '09:05', duration: '4 min 18', status: "Traité par l'IA", kind: 'ok',
        subject: 'Cadrage de mission',
        transcript: 'Demande de cadrage sur un projet de refonte organisationnelle, 40 personnes. Premier rendez-vous fixé jeudi 30 à 11h00.' },
      { id: 2, caller: 'M. Vasseur', time: '10:30', duration: '1 min 10', status: 'Transféré (client clé)', kind: 'urgent',
        subject: 'Mission en cours',
        transcript: 'Client sous contrat, question bloquante sur un livrable. Transféré immédiatement selon la règle « clients clés ».' },
      { id: 3, caller: 'Mme Delaunay', time: '14:20', duration: '2 min 45', status: "Traité par l'IA", kind: 'ok',
        subject: 'Tarifs et modalités',
        transcript: 'Question sur le tarif journalier et les modalités d\'intervention. Réponse fournie depuis la base de connaissances.' },
      { id: 4, caller: 'Numéro inconnu', time: '16:50', duration: '0 min 40', status: 'En attente de rappel', kind: 'pending',
        subject: 'Demande non qualifiée',
        transcript: 'Appel interrompu avant qualification du besoin. Rappel programmé.' }
    ],
    drafts: [
      { id: 1, subject: 'Proposition de rendez-vous de cadrage', to: 'direction@novaris.fr', category: 'Nouveau client', time: '09:12',
        preview: 'Suite à notre échange, je vous propose un premier rendez-vous de cadrage jeudi 30 à 11h00...' },
      { id: 2, subject: 'Modalités et tarif journalier', to: 'delaunay.a@email.fr', category: 'Question générale', time: '14:25',
        preview: 'Merci de votre intérêt. Mon tarif journalier est de 950 € HT, avec un premier échange offert...' },
      { id: 3, subject: 'Point d\'avancement — livrable 2', to: 'vasseur@groupe-vs.fr', category: 'Mission en cours', time: 'Hier 17:30',
        preview: 'Voici l\'état d\'avancement du livrable 2 et les arbitrages attendus de votre côté...' }
    ],
    sent: [
      { id: 1, subject: 'Confirmation de rendez-vous — jeudi 11h', to: 'direction@novaris.fr', time: 'Hier 18:20' },
      { id: 2, subject: 'Accusé de réception de votre demande', to: 'delaunay.a@email.fr', time: 'Hier 14:28' },
      { id: 3, subject: 'Compte rendu d\'atelier', to: 'vasseur@groupe-vs.fr', time: 'Lundi 19:05' }
    ],
    rdv: [
      { id: 1, day: 'Auj.',   client: 'M. Vasseur',    type: 'Point de mission',    time: '14:00' },
      { id: 2, day: 'Auj.',   client: 'Atelier Novaris', type: 'Atelier cadrage',   time: '16:00' },
      { id: 3, day: 'Jeu 30', client: 'Sté Novaris',   type: 'Rendez-vous cadrage', time: '11:00' },
      { id: 4, day: 'Ven 31', client: 'Mme Delaunay',  type: 'Premier échange',     time: '09:30' },
      { id: 5, day: 'Lun 03', client: 'Groupe VS',     type: 'Comité de pilotage',  time: '10:00' }
    ],
    agendaRules: 'Rendez-vous du lundi au vendredi 9h-19h. Vendredi après-midi réservé à la production.',
    agendaLast: 'Comité de pilotage Groupe VS déplacé au 03/08 à 10h.',
    faq: [
      { id: 1, q: 'Tarif journalier',        a: '950 € HT, premier échange de cadrage offert.' },
      { id: 2, q: "Domaines d'intervention", a: 'Organisation, transformation et pilotage de projet.' },
      { id: 3, q: 'Modalités',               a: 'Sur site ou à distance, missions de 5 à 40 jours.' },
      { id: 4, q: 'Disponibilité',           a: 'Nouvelles missions à partir de septembre.' }
    ],
    contacts: [
      { id: 1, name: 'Votre portable',   reason: 'Clients sous contrat' },
      { id: 2, name: 'Groupe VS',        reason: 'Mission en cours' },
      { id: 3, name: 'Sté Novaris',      reason: 'Négociation en cours' }
    ],
    voiceLog: [
      { id: 1, order: 'Cale un point avec Novaris jeudi matin', when: "Aujourd'hui 08:20",
        result: 'RDV cadrage Novaris créé le 30/07 11:00', state: 'done' },
      { id: 2, order: 'Envoie le compte rendu à Vasseur', when: 'Hier 19:00',
        result: 'Compte rendu envoyé automatiquement', state: 'done' },
      { id: 3, order: 'Bloque mes vendredis après-midi', when: 'Lundi 09:15',
        result: 'Règle de disponibilité mise à jour', state: 'done' }
    ],
    voiceDemo: [
      { heard: 'Ally, cale un point avec Novaris jeudi matin.', confirm: null,
        reply: "C'est fait, un rendez-vous de cadrage avec Novaris est posé jeudi à 11h00." },
      { heard: 'Ally, envoie le compte rendu à M. Vasseur.',
        confirm: 'Envoyer le compte rendu d\'atelier à M. Vasseur, vous confirmez ?',
        reply: 'Le compte rendu est parti, M. Vasseur en a reçu copie.' },
      { heard: 'Ally, à partir de maintenant bloque tous mes vendredis après-midi.',
        confirm: 'Je modifie votre règle de disponibilité pour tous les vendredis après-midi, c\'est confirmé ?',
        reply: 'Règle mise à jour : vos vendredis après-midi ne sont plus proposés aux clients.' }
    ],
    stats: { saved: '5h30', avoided: 18, validated: 12 }
  }
};

/* Nom d'usage : le titre vient du métier, sinon la civilité. */
window.ALLY_DISPLAY_NAME = function (identity, profile) {
  var title = (profile && profile.title) ? profile.title : identity.civility;
  return (title ? title + ' ' : '') + identity.lastName;
};
