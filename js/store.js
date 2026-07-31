/* Ally — état du compte, persisté en localStorage.
   L'onboarding écrit, l'espace pro lit : le tableau de bord reste celui du
   professionnel après un rechargement, avec ses réglages. */
(function () {
  'use strict';

  var KEY = 'ally.account.v1';

  var DEFAULT_HOURS = [
    { id: 'lun', label: 'Lundi',    on: true,  from: '09:00', to: '18:30' },
    { id: 'mar', label: 'Mardi',    on: true,  from: '09:00', to: '18:30' },
    { id: 'mer', label: 'Mercredi', on: true,  from: '09:00', to: '12:30' },
    { id: 'jeu', label: 'Jeudi',    on: true,  from: '09:00', to: '18:30' },
    { id: 'ven', label: 'Vendredi', on: true,  from: '09:00', to: '18:30' },
    { id: 'sam', label: 'Samedi',   on: false, from: '09:00', to: '12:00' },
    { id: 'dim', label: 'Dimanche', on: false, from: '09:00', to: '12:00' }
  ];

  /* Compte de démonstration, utilisé tant que l'onboarding n'a pas été fait :
     le tableau de bord est ainsi toujours consultable directement. */
  function defaults() {
    var trade = 'avocat';
    var profile = window.ALLY_PROFILES[trade];
    return {
      configured: false,
      identity: { civility: 'M.', firstName: 'Antoine', lastName: 'Dubois', org: 'Cabinet Dubois & Associés', email: '', phone: '06 12 34 56 78' },
      trade: trade,
      hours: JSON.parse(JSON.stringify(DEFAULT_HOURS)),
      closures: 'Jours fériés, mercredi après-midi',
      rules: { transfer: true, draft: false, record: true, autobook: true, voice: true },
      autonomy: { calls: profile.autonomy.calls, emails: profile.autonomy.emails, agenda: profile.autonomy.agenda },
      greeting: '',
      notif: { sms: true, push: true, email: false },
      retentionDays: 90,
      summaryFreq: 'daily',
      voiceEnabled: true,
      /* Aucune confirmation orale avant exécution — choix produit assumé.
         Le réglage reste disponible pour qui préfère relire avant envoi. */
      confirmLevel: 'none',
      chatSpeaks: true,
      /* Voix d'Ally : identifiant de la voix du navigateur, débit, hauteur. */
      voice: { uri: '', rate: 1, pitch: 1 },
      planId: 'cabinet',
      plan: '',
      subscription: null,
      links: { gmail: false, outlook: false, gcal: false, phone: false, sms: true },
      waitlist: [],
      data: null,
      /* Script d'appel : null tant que le pro ne l'a pas personnalisé, on
         retombe alors sur celui généré pour son métier. */
      script: null
    };
  }

  /* Script d'appel par défaut, dérivé du métier et de l'identité. */
  function defaultScript(profile, identity, greeting) {
    var who = window.ALLY_DISPLAY_NAME(identity, profile);
    var client = profile.clientWord;
    return [
      { id: 'greeting', label: 'Accueil',
        hint: 'La toute première phrase, dès le décroché.',
        text: greeting },
      { id: 'qualify', label: 'Qualification',
        hint: 'Comment Ally identifie le motif de l\'appel.',
        text: 'Très bien. Pouvez-vous me préciser votre demande, afin que je vous oriente correctement ?' },
      { id: 'urgent', label: 'Urgence détectée',
        hint: 'Déclenché dès qu\'une urgence est reconnue. Transfert immédiat.',
        text: 'Je comprends qu\'il s\'agit d\'une urgence. Je vous mets en relation immédiatement avec '
          + who + ', ne quittez pas.' },
      { id: 'booking', label: 'Prise de rendez-vous',
        hint: 'Proposition de créneau, dans vos disponibilités déclarées.',
        text: 'Je regarde les disponibilités. Je peux vous proposer un créneau, cela vous convient-il ?' },
      { id: 'unknown', label: 'Demande hors périmètre',
        hint: 'Quand Ally ne sait pas répondre : elle prend un message, elle n\'invente pas.',
        text: 'Je préfère ne pas répondre à votre place sur ce point. Je note votre demande et '
          + who + ' vous rappellera. Puis-je avoir votre nom et votre numéro ?' },
      { id: 'closing', label: 'Clôture',
        hint: 'La phrase de fin, toujours prononcée.',
        text: 'C\'est noté, je transmets. Merci de votre appel et belle journée.' }
    ];
  }

  function merge(base, saved) {
    if (!saved || typeof saved !== 'object') return base;
    Object.keys(base).forEach(function (key) {
      var value = saved[key];
      if (value === undefined || value === null) return;
      // base[key] peut valoir null (script non personnalisé) : on affecte alors
      // directement, sinon Object.keys(null) planterait à la lecture du compte.
      if (base[key] === null || Array.isArray(base[key]) || typeof base[key] !== 'object') {
        base[key] = value;
      } else {
        base[key] = merge(base[key], value);
      }
    });
    return base;
  }

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  /* Jeu de données vivant du compte, initialisé depuis le profil métier.
     C'est lui que l'interface modifie : envoyer un brouillon, annuler un
     rendez-vous ou ajouter une fiche agit vraiment, et survit au rechargement. */
  function seed(trade) {
    var p = window.ALLY_PROFILES[trade];
    return {
      trade: trade,
      calls: clone(p.calls),
      drafts: clone(p.drafts),
      sent: clone(p.sent),
      rdv: clone(p.rdv),
      faq: clone(p.faq),
      contacts: clone(p.contacts),
      voiceLog: clone(p.voiceLog),
      blocked: []
    };
  }

  var state = defaults();
  try {
    var raw = window.localStorage.getItem(KEY);
    if (raw) state = merge(defaults(), JSON.parse(raw));
  } catch (e) { /* localStorage indisponible : on reste sur le compte de démo */ }

  window.ALLY_STORE = {
    state: state,
    DEFAULT_HOURS: DEFAULT_HOURS,

    profile: function () {
      return window.ALLY_PROFILES[state.trade] || window.ALLY_PROFILES.avocat;
    },

    /* Données du compte, réensemencées si le métier a changé. */
    data: function () {
      if (!state.data || state.data.trade !== state.trade) {
        state.data = seed(state.trade);
        this.save();
      }
      return state.data;
    },

    /* Formule d'abonnement et capacités qu'elle débloque. */
    plan: function () { return state.plan || window.ALLY_PLAN_BY_ID(state.planId).name; },

    planData: function () { return window.ALLY_PLAN_BY_ID(state.planId); },

    /* Une capacité absente de la formule est masquée, pas désactivée en
       silence : l'interface propose alors la montée en gamme. */
    can: function (capability) {
      var caps = this.planData().caps;
      return !!caps[capability];
    },

    /* Journalise un ordre vocal ou une action d'Ally. */
    log: function (order, result, done) {
      this.data().voiceLog.unshift({
        id: Date.now(), order: order, when: 'À l\'instant',
        result: result, state: done === false ? 'wait' : 'done'
      });
      this.save();
    },

    /* Nom d'usage : « Maître Dubois », « Docteur Lambert », « M. Morel »… */
    displayName: function () {
      return window.ALLY_DISPLAY_NAME(state.identity, this.profile());
    },

    fullName: function () {
      return (state.identity.firstName + ' ' + state.identity.lastName).trim();
    },

    /* Script d'accueil : celui saisi par le pro, sinon celui du métier. */
    greeting: function () {
      if (state.greeting) return state.greeting;
      return this.profile().greeting({ org: state.identity.org, name: this.displayName() });
    },

    /* Script d'appel courant : celui du pro, sinon celui de son métier. */
    script: function () {
      if (state.script && state.script.length) return state.script;
      return defaultScript(this.profile(), state.identity, this.greeting());
    },

    resetScript: function () {
      state.script = defaultScript(this.profile(), state.identity, this.greeting());
      this.save();
      return state.script;
    },

    voiceOptions: function () {
      return { voiceURI: state.voice.uri, rate: state.voice.rate, pitch: state.voice.pitch };
    },

    save: function () {
      try { window.localStorage.setItem(KEY, JSON.stringify(state)); return true; }
      catch (e) { return false; }
    },

    /* On réécrit l'objet sur place : les modules qui en gardent une référence
       (l'onboarding, par exemple) restent synchronisés. */
    reset: function () {
      try { window.localStorage.removeItem(KEY); } catch (e) {}
      var fresh = defaults();
      Object.keys(state).forEach(function (key) { delete state[key]; });
      Object.keys(fresh).forEach(function (key) { state[key] = fresh[key]; });
    }
  };

  /* Repart du questionnaire. Le fichier de démonstration autonome remplace
     cette fonction par un simple rechargement, puisqu'il n'a pas de pages. */
  window.ALLY_RESTART = function () { window.location.href = 'onboarding.html'; };
})();
