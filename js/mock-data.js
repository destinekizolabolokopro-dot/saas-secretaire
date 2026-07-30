/* Ally — données fictives de démonstration.
   Cohérentes avec la date affichée dans l'espace pro (mardi 28 juillet 2026) :
   les libellés « Jeu 30 », « Ven 31 » et le déplacement au 31/07 s'y rapportent.
   À remplacer par les réponses d'une vraie API lors de l'implémentation. */
window.ALLY_DATA = {

  tabs: [
    { id: 'overview',      label: "Vue d'ensemble" },
    { id: 'calls',         label: 'Appels' },
    { id: 'emails',        label: 'Emails' },
    { id: 'agenda',        label: 'Agenda' },
    { id: 'config',        label: 'Configuration IA' },
    { id: 'knowledge',     label: 'Base de connaissances' },
    { id: 'billing',       label: 'Facturation' },
    { id: 'security',      label: 'Sécurité' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'support',       label: 'Support' }
  ],

  calls: [
    { id: 1, caller: 'Mme Aubert', time: '09:12', duration: '2 min 40', status: "Traité par l'IA", kind: 'ok',
      transcript: "Demande de report de rendez-vous du jeudi 30 au vendredi 31 juillet, motif : conflit d'agenda. Nouveau créneau confirmé à 14h." },
    { id: 2, caller: 'M. Lefebvre', time: '10:42', duration: '1 min 05', status: 'Transféré (urgence)', kind: 'urgent',
      transcript: "Appelant mentionne une urgence liée à une audience du lendemain. Transféré immédiatement sur le portable de Maître Dubois selon la règle « urgences »." },
    { id: 3, caller: 'Sté Meridian', time: '11:20', duration: '3 min 12', status: "Traité par l'IA", kind: 'ok',
      transcript: 'Question sur les tarifs de consultation initiale. Réponse fournie à partir de la base de connaissances du cabinet.' },
    { id: 4, caller: 'Numéro masqué', time: '14:05', duration: '0 min 48', status: 'En attente de rappel', kind: 'pending',
      transcript: "Appel raccroché après le message d'accueil, aucune demande identifiée. Rappel programmé." }
  ],

  emailDrafts: [
    { id: 1, subject: 'Confirmation de rendez-vous — Mme Aubert', to: 'aubert@email.fr', category: 'RDV',
      preview: 'Nous vous confirmons votre nouveau rendez-vous le vendredi 31 juillet à 14h...' },
    { id: 2, subject: 'Réponse à votre demande de renseignements', to: 'contact@meridian.fr', category: 'Nouveau client',
      preview: 'Merci pour votre message. Concernant votre dossier, nous vous proposons...' },
    { id: 3, subject: 'Suivi de dossier — relance', to: 'petit.j@email.fr', category: 'Question générale',
      preview: 'Faisant suite à notre échange, veuillez trouver ci-joint les éléments demandés...' }
  ],

  emailsSent: [
    { id: 1, subject: 'Accusé de réception — dossier #4521', time: 'Hier 18:32' },
    { id: 2, subject: 'Rappel de rendez-vous — demain 10h', time: 'Hier 09:00' },
    { id: 3, subject: "Confirmation d'annulation", time: 'Lundi 16:14' }
  ],

  upcomingRdv: [
    { id: 1, day: 'Auj.',   client: 'Mme Aubert',    type: 'Consultation',          time: '14:00' },
    { id: 2, day: 'Auj.',   client: 'M. Chevalier',  type: 'Suivi de dossier',      time: '16:30' },
    { id: 3, day: 'Jeu 30', client: 'Sté Meridian',  type: 'Première consultation', time: '09:30' },
    { id: 4, day: 'Ven 31', client: 'M. Petit',      type: 'Suivi de dossier',      time: '14:00' },
    { id: 5, day: 'Lun 03', client: 'Mme Roussel',   type: 'Consultation',          time: '11:00' }
  ],

  priorityContacts: [
    { id: 1, name: 'Maître Dubois (portable)',        reason: 'Urgences procédurales' },
    { id: 2, name: 'Tribunal judiciaire',             reason: 'Appels du greffe' },
    { id: 3, name: 'Assurance protection juridique',  reason: 'Dossiers en cours' }
  ],

  faqItems: [
    { id: 1, q: 'Horaires du cabinet',            a: 'Lundi au vendredi, 9h - 18h30. Fermé le mercredi après-midi.' },
    { id: 2, q: 'Tarif consultation initiale',    a: '120 € TTC, 45 minutes.' },
    { id: 3, q: "Zones d'intervention",           a: 'Droit du travail et droit des affaires, tribunal judiciaire de Lyon.' },
    { id: 4, q: 'Documents à apporter en RDV',    a: "Pièce d'identité et l'ensemble des documents liés au dossier." }
  ],

  billingHistory: [
    { id: 1, date: '01/07/2026', amount: '149 €', status: 'Payée' },
    { id: 2, date: '01/06/2026', amount: '149 €', status: 'Payée' },
    { id: 3, date: '01/05/2026', amount: '149 €', status: 'Payée' }
  ],

  accessLog: [
    { id: 1, who: 'Maître Dubois',  what: "Consultation des transcriptions d'appels", when: "Aujourd'hui 09:20" },
    { id: 2, who: 'Ally (système)', what: 'Traitement automatique — appel entrant',   when: "Aujourd'hui 09:12" },
    { id: 3, who: 'Maître Dubois',  what: 'Export des données de facturation',        when: 'Hier 17:40' }
  ],

  tutorials: [
    { id: 1, title: 'Configurer vos règles de transfert' },
    { id: 2, title: 'Comprendre le mode brouillon à valider' },
    { id: 3, title: 'Synchroniser votre agenda' },
    { id: 4, title: 'Ajouter des contacts prioritaires' },
    { id: 5, title: 'Donner des ordres à Ally à la voix' }
  ],

  /* Historique des ordres vocaux — transparence sur ce qu'Ally a exécuté. */
  voiceLog: [
    { id: 1, order: "Déplace mon rdv de 14h à demain même heure", when: "Aujourd'hui 08:54",
      result: 'RDV Mme Aubert déplacé au 29/07 14:00', state: 'done' },
    { id: 2, order: "Bloque mon agenda vendredi après-midi", when: 'Hier 19:12',
      result: 'Créneau 31/07 14:00-18:30 marqué indisponible', state: 'done' },
    { id: 3, order: "Envoie un mail à Mme Dupont pour confirmer jeudi", when: 'Hier 17:05',
      result: 'Brouillon préparé, en attente de validation', state: 'wait' },
    { id: 4, order: "Transfère toutes les urgences sur mon portable", when: 'Lundi 11:40',
      result: 'Règle de transfert mise à jour', state: 'done' }
  ],

  /* Ordres joués en boucle dans l'overlay vocal de démonstration. */
  voiceDemo: [
    { heard: "Ally, déplace mon rendez-vous de 14h à demain même heure.",
      confirm: 'Vous voulez bien que je déplace le rendez-vous de Mme Aubert à demain 14h ?',
      reply: "C'est fait, votre rendez-vous de 14h avec Mme Aubert est déplacé à demain 14h." },
    { heard: "Ally, bloque mon agenda vendredi après-midi.",
      confirm: null,
      reply: 'Vendredi après-midi est bloqué, aucun rendez-vous ne sera proposé sur ce créneau.' },
    { heard: "Ally, envoie un mail à Mme Dupont pour confirmer le rendez-vous de jeudi.",
      confirm: "Envoyer un email de confirmation à Mme Dupont pour jeudi, c'est confirmé ?",
      reply: 'Le brouillon est prêt dans vos emails à valider — votre profil interdit un envoi direct.' },
    { heard: "Ally, à partir de maintenant transfère toutes les urgences sur mon portable.",
      confirm: 'Je modifie votre règle de transfert des urgences, vous confirmez ?',
      reply: 'Règle mise à jour : les urgences arrivent désormais directement sur votre portable.' }
  ],

  chat: [
    { from: 'in',  text: 'Bonjour, comment puis-je vous aider avec Ally aujourd’hui ?' },
    { from: 'out', text: "Comment modifier le script d'accueil ?" },
    { from: 'in',  text: "Rendez-vous dans Configuration IA → Script d'accueil téléphonique, modifiez le texte, il est appliqué immédiatement." }
  ]
};
