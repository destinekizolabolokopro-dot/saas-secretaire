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
  var state = { at: 0, pushing: false, timer: null, empreinte: '', pret: false };
  var DELAI = 1500;

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
        return true;
      }
      /* Le serveur détient une version plus récente : c'est elle qui vaut. */
      if (res.status === 409) return pull(true);
      return false;
    }, function () { state.pushing = false; return false; });
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
