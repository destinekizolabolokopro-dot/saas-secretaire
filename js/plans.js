/* Ally — formules d'abonnement.
   Positionnement : sous le coût d'un télésecrétariat externalisé, très
   au-dessus d'un simple répondeur. La valeur vendue n'est pas la minute
   d'appel, c'est le client qu'on ne perd pas. */
window.ALLY_PLANS = [
  {
    id: 'permanence',
    name: 'Permanence',
    price: 79,
    priceYear: 790,
    tagline: 'Pour ne plus jamais manquer un appel.',
    forWho: 'Indépendant qui démarre, moins de 5 appels par jour',
    quota: { calls: 120, emails: 300 },
    features: [
      'Ally décroche 24 h/24, avec votre script',
      'Transfert des urgences sur votre portable',
      'Prise de rendez-vous dans votre agenda',
      'Transcription et résumé de chaque appel',
      'Emails de confirmation et de rappel',
      '1 ligne téléphonique'
    ],
    missing: ['Brouillons de réponse rédigés', 'Commande vocale', 'Plusieurs lignes']
  },
  {
    id: 'cabinet',
    name: 'Cabinet',
    price: 149,
    priceYear: 1490,
    popular: true,
    tagline: 'L\'assistante complète, appels, emails et agenda.',
    forWho: 'Le cas courant : un professionnel seul, en activité pleine',
    quota: { calls: 400, emails: 1200 },
    features: [
      'Tout ce que contient Permanence',
      'Brouillons de réponse rédigés, validés par vous',
      'Commande vocale depuis l\'application',
      'Base de connaissances illimitée',
      'Règles d\'autonomie par type de tâche',
      'Résumé quotidien par email ou SMS',
      'Voix personnalisable'
    ],
    missing: ['Plusieurs lignes', 'Plusieurs collaborateurs']
  },
  {
    id: 'associes',
    name: 'Associés',
    price: 299,
    priceYear: 2990,
    tagline: 'Plusieurs praticiens, une seule assistante.',
    forWho: 'Cabinet de 2 à 5 associés, ou activité à fort volume',
    quota: { calls: 1500, emails: 5000 },
    features: [
      'Tout ce que contient Cabinet',
      'Jusqu\'à 5 lignes et 5 collaborateurs',
      'Routage par praticien et par motif',
      'Agendas multiples synchronisés',
      'Journal d\'accès détaillé par utilisateur',
      'Accompagnement à la mise en route',
      'Support prioritaire sous 4 h'
    ],
    missing: []
  }
];

window.ALLY_TRIAL = {
  days: 14,
  label: 'Pilote',
  note: '14 jours pour tester avec vos vrais appels. Sans carte bancaire, sans engagement.'
};

window.ALLY_PLAN_BY_ID = function (id) {
  return window.ALLY_PLANS.filter(function (p) { return p.id === id; })[0]
    || window.ALLY_PLANS[1];
};
