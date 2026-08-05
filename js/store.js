/* Ally — état du compte, persisté en localStorage.
   L'onboarding écrit, l'espace pro lit : le tableau de bord reste celui du
   professionnel après un rechargement, avec ses réglages. */
(function () {
  'use strict';

  /* Une clé par compte : deux professionnels qui se connectent depuis le même
     navigateur ne doivent pas voir la configuration l'un de l'autre. C'est la
     version « front » du cloisonnement décrit dans ARCHITECTURE.md — côté
     serveur, ce sera un filtre sur cabinet_id déduit du jeton de session. */
  function storageKey() {
    return 'ally.account.v1' +
      (window.ALLY_ACCOUNTS ? window.ALLY_ACCOUNTS.suffix() : '');
  }
  var KEY = storageKey();

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
      /* Réponses au questionnaire d'installation. Elles ne servent pas qu'à
         faire joli : le volume d'appels choisit la formule recommandée, les
         motifs alimentent la base de connaissances, la durée de rendez-vous
         est reprise par l'agenda. */
      survey: {
        volume: '', clients: '', pain: [], tools: [], today: '',
        motifs: [], rdvDuration: '45', callback: '24h', firstTime: '', notes: '',
        /* Définition de l'urgence, par métier. La règle « transférer les
           urgences » existait sans qu'on ait jamais dit ce qu'était une
           urgence : c'est ce que remplit cette section. */
        urgency: { motifs: [], words: '', fallback: 'Je prends un message', window: 'always' }
      },
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

    /* Consommation du mois : la limite vient de la formule souscrite, jamais
       du métier. Le métier ne fournit que la consommation déjà réalisée, à
       laquelle s'ajoute l'activité de la session. */
    usage: function () {
      var base = this.profile().quota;
      var limits = this.planData().quota;
      var D = this.data();
      var extraCalls = Math.max(0, D.calls.length - window.ALLY_PROFILES[D.trade].calls.length);
      var extraMails = Math.max(0, D.sent.length - window.ALLY_PROFILES[D.trade].sent.length);
      return {
        calls:  { used: base.calls[0] + extraCalls,  limit: limits.calls },
        emails: { used: base.emails[0] + extraMails, limit: limits.emails }
      };
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

    /* Relit le compte de l'utilisateur connecté. Appelé après une connexion ou
       une déconnexion : la clé de stockage a changé, l'état en mémoire doit
       suivre, sans recharger la page. */
    reload: function () {
      KEY = storageKey();
      var fresh = defaults();
      try {
        var stored = window.localStorage.getItem(KEY);
        if (stored) fresh = merge(defaults(), JSON.parse(stored));
      } catch (e) {}

      /* L'annuaire fait autorité sur l'identité et la formule : c'est lui que
         l'administrateur modifie. */
      var user = window.ALLY_ACCOUNTS && window.ALLY_ACCOUNTS.current();
      if (user) {
        fresh.identity.civility = user.civility || fresh.identity.civility;
        fresh.identity.firstName = user.firstName || fresh.identity.firstName;
        fresh.identity.lastName = user.lastName || fresh.identity.lastName;
        fresh.identity.email = user.email || fresh.identity.email;
        if (user.org) fresh.identity.org = user.org;
        if (user.trade) fresh.trade = user.trade;
        fresh.planId = user.planId || fresh.planId;
        fresh.plan = window.ALLY_PLAN_BY_ID(fresh.planId).name;
        fresh.configured = !!user.onboarded;
      }

      Object.keys(state).forEach(function (key) { delete state[key]; });
      Object.keys(fresh).forEach(function (key) { state[key] = fresh[key]; });
      return state;
    },

    /* Reporte dans l'annuaire ce que le professionnel vient de configurer,
       pour que la console d'administration le voie. */
    syncAccount: function () {
      var accounts = window.ALLY_ACCOUNTS;
      if (!accounts || !accounts.currentId()) return;
      accounts.update(accounts.currentId(), {
        civility: state.identity.civility,
        firstName: state.identity.firstName,
        lastName: state.identity.lastName,
        org: state.identity.org,
        trade: state.trade,
        planId: state.planId,
        onboarded: !!state.configured,
        survey: state.survey
      });
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

  /* Session ouverte au chargement : l'annuaire fait autorité sur l'identité,
     le métier et la formule. */
  if (window.ALLY_ACCOUNTS && window.ALLY_ACCOUNTS.currentId()) {
    window.ALLY_STORE.reload();
  }

  /* Repart du questionnaire. Le fichier de démonstration autonome remplace
     cette fonction par un simple rechargement, puisqu'il n'a pas de pages. */
  window.ALLY_RESTART = function () { window.location.href = 'onboarding.html'; };
})();
