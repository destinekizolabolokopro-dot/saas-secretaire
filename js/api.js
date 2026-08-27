/* Ally — pont vers l'API.

   Le front sait fonctionner sans serveur : c'est ce qui permet d'ouvrir le
   fichier de démonstration par double-clic, et de montrer le produit sans rien
   installer. Ce module ajoute la seconde possibilité — quand une API répond, on
   s'en sert.

   La détection est faite une fois au chargement, avec un délai court : une
   page qui attend un serveur absent est pire qu'une page sans serveur. */
(function () {
  'use strict';

  /* L'API se déclare, elle ne se devine pas. Le serveur d'Ally pose
     window.ALLY_API_BASE dans les pages qu'il sert ; partout ailleurs — fichier
     ouvert par double-clic, hébergeur statique — le front reste en mode local
     sans émettre la moindre requête. Sonder à l'aveugle produirait un 404
     rouge dans la console de chaque visiteur, pour un état normal. */
  var BASE = window.ALLY_API_BASE || null;

  /* Délai d'attente de la première requête. Il était à 1,2 s, ce qui semblait
     prudent et ne l'était pas : sur une machine chargée, la réponse arrivait
     après, et l'application basculait en silence en mode local — le compte
     réel de la personne disparaissait de l'écran sans un mot. Cinq secondes
     laissent passer un serveur qui démarre ou un téléphone au ralenti. */
  var PROBE_MS = 5000;

  var state = { checked: false, online: false, cabinetId: null, role: null };
  var waiting = [];

  function request(method, path, body) {
    var options = {
      method: method,
      headers: { 'content-type': 'application/json' },
      /* Le jeton de session est un cookie httpOnly : le JavaScript ne le voit
         jamais, mais il part avec la requête. C'est précisément l'intérêt —
         une faille XSS ne suffit pas à voler la session. */
      credentials: 'same-origin'
    };
    if (body !== undefined) options.body = JSON.stringify(body);

    return window.fetch(BASE + path, options).then(function (response) {
      return response.json().catch(function () { return {}; })
        .then(function (payload) {
          return { status: response.status, ok: response.ok, body: payload };
        });
    });
  }

  /* Une seule requête au démarrage, et c'est « qui suis-je ». Elle répond aux
     deux questions à la fois : le serveur est-il là, et une session y est-elle
     déjà ouverte ? Sonder /health d'abord ajoutait un aller-retour pour une
     information que celle-ci contient déjà. */
  function probe() {
    if (!BASE) return Promise.resolve(null);
    if (!window.fetch || !window.AbortController) return Promise.resolve(null);
    if (window.location.protocol === 'file:') return Promise.resolve(null);

    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, PROBE_MS);

    return window.fetch(BASE + '/me', { signal: controller.signal, credentials: 'same-origin' })
      .then(function (response) {
        return response.json().catch(function () { return {}; });
      })
      .catch(function () { return null; })
      .then(function (payload) {
        window.clearTimeout(timer);
        return payload;
      });
  }

  var ready = probe().then(function (me) {
    state.checked = true;
    state.online = !!me;

    if (me && me.authenticated) {
      state.cabinetId = me.cabinet && me.cabinet.id;
      state.role = me.role;
    }
    flush();
    return state.online;
  });

  function flush() {
    waiting.forEach(function (fn) { fn(state.online); });
    waiting = [];
  }

  window.ALLY_API = {
    /* Synchrone : utilisable dans un rendu. Faux tant que la sonde n'a pas
       répondu, ce qui est le bon défaut — on part du mode local. */
    online: function () { return state.online; },
    checked: function () { return state.checked; },
    cabinetId: function () { return state.cabinetId; },
    role: function () { return state.role; },

    /* Prévenu dès que la sonde a tranché. Si elle a déjà répondu, rappel
       immédiat : un abonné tardif ne doit pas rester en attente. */
    onReady: function (fn) {
      if (state.checked) fn(state.online); else waiting.push(fn);
    },

    ready: function () { return ready; },

    /* ---------------------------------------------------------- Comptes */
    signup: function (payload) { return request('POST', '/auth/signup', payload); },
    verify: function (userId, code) { return request('POST', '/auth/verify', { userId: userId, code: code }); },
    resend: function (userId) { return request('POST', '/auth/resend', { userId: userId }); },
    login: function (email, password) { return request('POST', '/auth/login', { email: email, password: password }); },
    logout: function () { return request('POST', '/auth/logout', {}); },
    forgot: function (email) { return request('POST', '/auth/forgot', { email: email }); },
    reset: function (userId, code, password) {
      return request('POST', '/auth/reset', { userId: userId, code: code, password: password });
    },

    /* ----------------------------------------------------------- Données */
    me: function () { return request('GET', '/me'); },
    calls: function () { return request('GET', '/calls'); },
    messages: function () { return request('GET', '/messages'); },
    send: function (payload) { return request('POST', '/messages', payload); },
    cancel: function (id) { return request('POST', '/messages/' + id + '/cancel', {}); },

    /* --------------------------------------------------------------- Cabinet */
    saveCabinet: function (payload) { return request('POST', '/cabinet', payload); },
    exportAccount: function () { return request('GET', '/account/export'); },
    journal: function () { return request('GET', '/account/journal'); },
    deleteAccount: function (password) {
      return request('POST', '/account/delete', { password: password });
    },

    /* ---------------------------------------------------------------- Agenda */
    rdv: function () { return request('GET', '/rdv'); },
    addRdv: function (payload) { return request('POST', '/rdv', payload); },
    cancelRdv: function (id) { return request('POST', '/rdv/' + id + '/cancel', {}); },
    moveRdv: function (id, payload) { return request('POST', '/rdv/' + id + '/move', payload); },

    /* --------------------------------------------------------- Collaborateurs */
    invite: function (email) { return request('POST', '/cabinet/invite', { email: email }); },
    removeMember: function (userId) {
      return request('POST', '/cabinet/members/' + userId + '/remove', {});
    },
    accept: function (userId, code, password) {
      return request('POST', '/auth/accept', { userId: userId, code: code, password: password });
    },

    /* ------------------------------------------------------------ Plateforme */
    adminStats: function () { return request('GET', '/admin/stats'); },
    adminEvents: function () { return request('GET', '/admin/events'); },

    /* Mémorise la session ouverte, pour que l'interface s'y réfère. */
    remember: function (body) {
      state.cabinetId = body.cabinetId || state.cabinetId;
      state.role = body.role || state.role;
    },

    forget: function () { state.cabinetId = null; state.role = null; }
  };
})();
