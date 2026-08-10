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
  var PROBE_MS = 1200;

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

  /* Sonde de disponibilité, une seule fois, sans bloquer l'affichage. */
  function probe() {
    if (!BASE) return Promise.resolve(false);
    if (!window.fetch || !window.AbortController) return Promise.resolve(false);
    if (window.location.protocol === 'file:') return Promise.resolve(false);

    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, PROBE_MS);

    return window.fetch(BASE + '/health', { signal: controller.signal, credentials: 'same-origin' })
      .then(function (response) { return response.ok; })
      .catch(function () { return false; })
      .then(function (ok) {
        window.clearTimeout(timer);
        return ok;
      });
  }

  var ready = probe().then(function (online) {
    state.checked = true;
    state.online = online;
    if (!online) { flush(); return false; }

    /* Session déjà ouverte dans un onglet précédent ? */
    return request('GET', '/me').then(function (res) {
      if (res.ok && res.body.authenticated) {
        state.cabinetId = res.body.cabinet && res.body.cabinet.id;
        state.role = res.body.role;
      }
      flush();
      return true;
    }).catch(function () { flush(); return true; });
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

    /* Mémorise la session ouverte, pour que l'interface s'y réfère. */
    remember: function (body) {
      state.cabinetId = body.cabinetId || state.cabinetId;
      state.role = body.role || state.role;
    },

    forget: function () { state.cabinetId = null; state.role = null; }
  };
})();
