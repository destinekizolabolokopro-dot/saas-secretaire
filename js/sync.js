/* Ally — la reprise des données du serveur dans l'espace de travail.

   Trois cartes montrent déjà le réel : la ligne, le courrier, l'agenda. Le
   reste de l'application, lui, continuait de lire le navigateur. Poser un
   rendez-vous sur la ligne réelle, puis demander à Ally « mes rendez-vous
   d'aujourd'hui ? », et elle récitait ceux du jeu de démonstration. Le
   calendrier, l'onglet « Aujourd'hui » et l'aperçu du résumé quotidien
   racontaient la même histoire à côté de la plaque.

   Ce module recopie donc les données du serveur dans la structure que tout le
   front lit déjà. La règle est simple : dès que le serveur a quelque chose,
   c'est lui qui a raison. Le jeu de démonstration cède la place — on ne peut
   pas afficher deux journées dans le même agenda, et celle qui compte est
   celle du vrai téléphone. Tant que le serveur n'a rien, on ne touche à rien :
   quelqu'un qui explore le produit garde ses exemples. */
(function () {
  'use strict';

  var api = window.ALLY_API;
  var store = window.ALLY_STORE;

  var last = '';

  function clock(at) {
    var d = new Date(at);
    return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' +
      (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }

  /* Un appel du serveur, dans la forme que lisent le tableau de bord, le
     moteur d'intentions et l'export CSV. */
  function asCall(call) {
    var kind = call.outcome === 'transferred' ? 'urgent'
      : call.outcome === 'noted' ? 'pending' : 'ok';
    var status = call.outcome === 'transferred' ? 'Transféré (urgence)'
      : call.outcome === 'noted' ? 'En attente de rappel' : 'Traité par l\'IA';

    return {
      id: call.id,
      caller: call.from || 'Numéro inconnu',
      time: clock(call.at || call.createdAt),
      duration: call.durationSec
        ? Math.floor(call.durationSec / 60) + ' min ' + (call.durationSec % 60) + ''
        : '—',
      status: status,
      kind: kind,
      subject: call.summary || 'Sans résumé',
      transcript: call.transcript || call.summary || '',
      real: true
    };
  }

  function asRdv(rdv) {
    return {
      id: rdv.id,
      date: rdv.date,
      time: rdv.time,
      client: rdv.client,
      type: rdv.type + (rdv.source === 'call' ? ' · pris par Ally' : ''),
      real: true
    };
  }

  /* Empreinte de ce qui a été recopié : sans elle, on réécrirait l'état à
     chaque battement, ce qui ferait clignoter l'écran et perdrait le
     défilement toutes les cinq secondes. */
  function signature(calls, rdv) {
    return calls.map(function (c) { return c.id; }).join(',') + '|' +
      rdv.map(function (r) { return r.id + r.date + r.time; }).join(',');
  }

  function pull(onChange) {
    if (!api || !api.online() || !api.cabinetId()) return Promise.resolve(false);

    return Promise.all([api.calls(), api.rdv()]).then(function (results) {
      var callsRes = results[0], rdvRes = results[1];
      if (!callsRes.ok || !rdvRes.ok) return false;

      var calls = (callsRes.body.calls || []).slice().reverse();
      var rdv = rdvRes.body.rdv || [];

      /* Rien côté serveur : on laisse la démonstration tranquille. */
      if (!calls.length && !rdv.length && store.state.dataMode !== 'empty') return false;

      var now = signature(calls, rdv);
      if (now === last) return false;
      last = now;

      /* Première donnée réelle sur un espace encore rempli d'exemples : on
         fait place nette. Mélanger les deux donnerait un agenda où la moitié
         des rendez-vous n'existe pas. Le bouton « Voir avec des données
         d'exemple » reste là pour qui veut les revoir. */
      if (store.state.dataMode !== 'empty') store.clearActivity();

      var D = store.data();
      D.calls = calls.map(asCall);
      D.rdv = rdv.map(asRdv);

      /* Un appel reçu est la seule preuve qu'un renvoi a été posé : le
         téléphone a sonné chez Ally, donc les codes ont bien été composés.
         Aucune déclaration ne vaut celle-là. */
      if (calls.length) store.markStep('forward');

      store.save();

      if (onChange) onChange();
      return true;
    }).catch(function () { return false; });
  }

  /* Les gestes de l'agenda doivent partir au serveur quand le rendez-vous en
     vient, sinon la synchronisation suivante les annule sans un mot : on
     annule un rendez-vous, il revient quinze secondes plus tard. Rien n'entame
     davantage la confiance dans un outil.

     Chaque fonction renvoie une promesse ; « false » veut dire « ce n'est pas
     du ressort du serveur, fais-le localement comme avant ». */
  function connected() {
    return !!(api && api.online() && api.cabinetId());
  }

  function isReal(id) {
    return typeof id === 'string' && /^rdv/.test(id);
  }

  window.ALLY_SYNC = {
    pull: pull,
    connected: connected,
    isReal: isReal,

    createRdv: function (payload) {
      if (!connected()) return Promise.resolve(false);
      return api.addRdv(payload).then(function (res) {
        if (res.ok) { last = ''; return { ok: true }; }
        return { ok: false, error: (res.body && res.body.error) || 'Rendez-vous refusé.' };
      }, function () { return { ok: false, error: 'Serveur injoignable.' }; });
    },

    dropRdv: function (id) {
      if (!connected() || !isReal(id)) return Promise.resolve(false);
      return api.cancelRdv(id).then(function () { last = ''; return { ok: true }; },
        function () { return { ok: false, error: 'Serveur injoignable.' }; });
    },

    moveRdv: function (id, date, time) {
      if (!connected() || !isReal(id)) return Promise.resolve(false);
      return api.moveRdv(id, { date: date, time: time }).then(function (res) {
        if (res.ok) { last = ''; return { ok: true }; }
        return { ok: false, error: (res.body && res.body.error) || 'Report refusé.' };
      }, function () { return { ok: false, error: 'Serveur injoignable.' }; });
    },

    /* Battement lent : les cartes « réelles » se rafraîchissent déjà toutes les
       cinq secondes pour leur propre compte. Ici, il s'agit seulement que le
       reste de l'application ne raconte pas autre chose. */
    start: function (onChange) {
      pull(onChange);
      return window.setInterval(function () { pull(onChange); }, 15000);
    }
  };
})();
