/* Ally — formules d'abonnement.
   La logique de prix suit le coût de revient, pas le nombre de cases cochées :
   Permanence est un standard téléphonique classique, sans IA, donc quasi
   gratuit à produire. Cabinet et Expert font tourner un agent vocal, dont la
   minute se paie — c'est ce qui justifie l'écart. */
window.ALLY_PLANS = [
  {
    id: 'permanence',
    name: 'Permanence',
    price: 79,
    priceYear: 790,
    tagline: 'Un standard qui décroche toujours. Sans IA.',
    forWho: 'Le pro qui veut d\'abord ne plus manquer d\'appel, sans changer ses habitudes',
    callMode: 'Menu vocal classique : « tapez 1 pour un rendez-vous, 2 pour… »',
    quota: { calls: 150, emails: 200 },
    /* Prix de l'appel au-delà du forfait. On ne coupe jamais la ligne : un
       appel refusé est un client perdu pour le cabinet, et c'est nous qu'il
       tiendra pour responsable. */
    overage: 0.45,
    /* Ce que la formule débloque réellement dans l'application. */
    caps: {
      app: true, aiCalls: false, autoNotes: false, aiEmails: false,
      voiceCommand: false, voiceAgenda: false, knowledge: false
    },
    features: [
      'Accès complet à l\'application Ally',
      'Menu vocal à touches, façon standard téléphonique',
      'Renvoi des urgences vers votre portable',
      'Historique et enregistrement des appels',
      'Agenda et emails gérés par vous dans l\'app'
    ],
    missing: [
      'Ally ne comprend pas le langage naturel',
      'Notes d\'appel à rédiger vous-même',
      'Pas de commande vocale « Hey Ally »'
    ]
  },
  {
    id: 'cabinet',
    name: 'Cabinet',
    price: 149,
    priceYear: 1490,
    popular: true,
    tagline: 'La vraie assistante IA. Elle comprend, rédige et exécute.',
    forWho: 'Le cas courant : un professionnel seul, en activité pleine',
    callMode: 'Ally comprend la demande en langage naturel et répond',
    quota: { calls: 400, emails: 1200 },
    overage: 0.35,
    caps: {
      app: true, aiCalls: true, autoNotes: true, aiEmails: true,
      voiceCommand: true, voiceAgenda: true, knowledge: true
    },
    features: [
      'Tout ce que contient Permanence',
      'Ally dialogue naturellement avec vos appelants',
      'Résumé et transcription générés automatiquement',
      'Ally rédige et envoie vos emails sur ordre vocal',
      'Agenda piloté à 100 % à la voix',
      'Commande vocale « Hey Ally » dans l\'application',
      'Base de connaissances du cabinet'
    ],
    missing: ['Routage multi-praticiens', 'Base de connaissances avancée']
  },
  {
    id: 'expert',
    name: 'Expert',
    price: 249,
    priceYear: 2490,
    tagline: 'Pour les cabinets à fort volume et à plusieurs.',
    forWho: 'Activité dense, ou cabinet à plusieurs praticiens',
    callMode: 'Agent vocal avancé, routage par motif et par praticien',
    quota: { calls: 1200, emails: 4000 },
    overage: 0.25,
    caps: {
      app: true, aiCalls: true, autoNotes: true, aiEmails: true,
      voiceCommand: true, voiceAgenda: true, knowledge: 'advanced'
    },
    features: [
      'Tout ce que contient Cabinet',
      'Jusqu\'à 5 lignes et 5 collaborateurs',
      'Routage par praticien et par motif d\'appel',
      'Base de connaissances avancée, documents indexés',
      'Agendas multiples synchronisés',
      'Journal d\'accès détaillé par utilisateur',
      'Support prioritaire sous 4 h'
    ],
    missing: []
  }
];

window.ALLY_TRIAL = {
  days: 14,
  label: 'Essai',
  note: '14 jours pour tester avec vos vrais appels. Sans carte bancaire, sans engagement.'
};

window.ALLY_PLAN_BY_ID = function (id) {
  return window.ALLY_PLANS.filter(function (p) { return p.id === id; })[0]
    || window.ALLY_PLANS[1];
};
