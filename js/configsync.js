/* Ally — la configuration suit le cabinet, pas l'appareil.

   Tout ce qui décrit le cabinet — métier, horaires, registre de parole, fiche,
   script d'appel, règles d'urgence — vivait dans le seul navigateur qui l'avait
   saisi. Un professionnel qui configurait Ally sur son ordinateur retrouvait un
   espace vierge sur son téléphone, et l'associé qu'il venait d'inviter
   n'héritait de rien. Ce n'est pas un réglage d'appareil : c'est le cabinet.

   Règle de conflit : la dernière écriture gagne, à condition d'être
   postérieure. Deux appareils qui se synchronisent ne doivent pas se ramener
   l'un l'autre en arrière. Le serveur refuse une écriture plus ancienne que ce
   qu'il détient, et l'appareil concerné reprend alors la version du serveur. */
(function () {
  'use strict';

  var api = window.ALLY_API;

  /* « prêt » compte : tant qu'on n'a pas lu la configuration du serveur, on
     n'a pas le droit de lui envoyer la nôtre. Sans ce verrou, une page qui
     enregistre au chargement — le questionnaire, par exemple — poussait sa
     configuration par défaut et effaçait celle du cabinet. Un professionnel
     ouvrant Ally sur son téléphone perdait ainsi tout ce qu'il avait réglé
     depuis son ordinateur. */
  var state = {
    at: 0, pushing: false, timer: null, empreinte: '', pret: false,
    /* Ce qui manquait : un envoi qui échoue ne repartait jamais. La
       configuration restait dans le seul navigateur qui l'avait saisie —
       exactement ce que ce module existe pour empêcher — et rien ne le
       disait. Une coupure de trois secondes suffisait. */
    essais: 0, reprise: null, enRetard: false
  };
  var DELAI = 1500;

  /* On retente, de plus en plus espacé : une coupure passagère se rattrape
     toute seule, une panne durable ne doit pas marteler le serveur. */
  var REPRISES = [4000, 10000, 30000, 60000];

  /* Prévenus quand l'état change — c'est le tableau de bord qui écoute, pour
     afficher ou retirer son avertissement sans interroger en boucle. */
  var abonnes = [];
  function annoncer() { abonnes.forEach(function (fn) { try { fn(state.enRetard); } catch (e) {} }); }

  function planifierReprise() {
    if (state.reprise) window.clearTimeout(state.reprise);
    var attente = REPRISES[Math.min(state.essais, REPRISES.length - 1)];
    state.essais += 1;

    /* On ne crie pas au premier échec : le temps d'une reprise, la plupart des
       coupures sont déjà finies. Au second, c'est autre chose. */
    if (state.essais >= 2 && !state.enRetard) { state.enRetard = true; annoncer(); }

    state.reprise = window.setTimeout(function () {
      state.reprise = null;
      push();
    }, attente);
  }

  function reprisesFinies() {
    if (state.reprise) { window.clearTimeout(state.reprise); state.reprise = null; }
    state.essais = 0;
    if (state.enRetard) { state.enRetard = false; annoncer(); }
  }

  function store() { return window.ALLY_STORE; }

  function connected() {
    return !!(api && api.online() && api.cabinetId());
  }

  function empreinte() {
    return JSON.stringify(store().configSnapshot());
  }

  /* Appelé à chaque enregistrement local. On temporise : saisir une adresse
     dans la fiche déclenche un enregistrement par caractère, et le serveur n'a
     pas à recevoir vingt versions d'une même phrase. */
  function touch() {
    if (!connected() || !state.pret) return;
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(push, DELAI);
  }

  function push() {
    if (!connected() || state.pushing) return Promise.resolve(false);

    var actuelle = empreinte();
    if (actuelle === state.empreinte) return Promise.resolve(false);

    state.pushing = true;
    var quand = Date.now();

    return api.saveConfig(JSON.parse(actuelle), quand).then(function (res) {
      state.pushing = false;
      if (res.ok) {
        state.empreinte = actuelle;
        state.at = res.body.updatedAt || quand;
        reprisesFinies();
        return true;
      }
      /* Le serveur détient une version plus récente : c'est elle qui vaut. */
      if (res.status === 409) { reprisesFinies(); return pull(true); }

      /* 401 ou 403 : la session est tombée. Retenter n'y changera rien, et
         l'utilisateur va de toute façon être renvoyé vers la connexion. */
      if (res.status === 401 || res.status === 403) { reprisesFinies(); return false; }

      planifierReprise();
      return false;
    }, function () {
      /* Réseau injoignable : c'est le cas qu'on veut rattraper. */
      state.pushing = false;
      planifierReprise();
      return false;
    });
  }

  /* Reprend la configuration du serveur si elle est plus récente que la
     nôtre. « force » sert au cas du conflit, où l'on sait déjà qu'elle l'est. */
  function pull(force) {
    if (!connected()) return Promise.resolve(false);

    return api.config().then(function (res) {
      if (!res.ok || !res.body.config) {
        /* Rien côté serveur : c'est notre configuration qui fait foi. */
        state.empreinte = '';
        return push();
      }

      var distante = res.body.updatedAt || 0;
      if (!force && distante <= state.at) return false;

      store().applyConfig(res.body.config);
      state.at = distante;
      state.empreinte = empreinte();
      if (window.ALLY_DASHBOARD_REFRESH) window.ALLY_DASHBOARD_REFRESH();
      return true;
    }, function () { return false; });
  }

  window.ALLY_CONFIG_SYNC = {
    /* Exposé pour les tests : savoir si la reprise a eu lieu, et depuis
       quand, évite de deviner en cas d'écart. */
    etat: state,
    touch: touch,
    push: push,
    pull: pull,

    /* Vrai quand une modification n'a pas atteint le cabinet malgré au moins
       une reprise. C'est ce que le tableau de bord affiche. */
    enRetard: function () { return state.enRetard; },
    surRetard: function (fn) { abonnes.push(fn); },
    /* Au chargement : on prend celle du serveur si elle est plus récente, on
       lui donne la nôtre sinon. */
    start: function () {
      state.empreinte = empreinte();
      return pull(false).then(function (result) {
        state.pret = true;
        return result;
      }, function () { state.pret = true; return false; });
    }
  };
})();
