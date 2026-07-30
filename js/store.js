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
      rules: { transfer: true, draft: true, record: true, autobook: true, voice: true },
      autonomy: { calls: profile.autonomy.calls, emails: profile.autonomy.emails, agenda: profile.autonomy.agenda },
      greeting: '',
      notif: { sms: true, push: true, email: false },
      retentionDays: 90,
      summaryFreq: 'daily',
      voiceEnabled: true,
      confirmLevel: 'sensitive'
    };
  }

  function merge(base, saved) {
    if (!saved || typeof saved !== 'object') return base;
    Object.keys(base).forEach(function (key) {
      var value = saved[key];
      if (value === undefined || value === null) return;
      if (Array.isArray(base[key])) base[key] = value;
      else if (typeof base[key] === 'object') base[key] = merge(base[key], value);
      else base[key] = value;
    });
    return base;
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
