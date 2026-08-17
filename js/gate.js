/* Ally — la porte d'entrée : inscription, vérification, connexion, oubli.

   Il y a deux mondes, et les écrans ne doivent pas avoir à le savoir.

   Sans serveur — fichier ouvert par double-clic, hébergeur statique — les
   comptes vivent dans le navigateur (js/accounts.js), les codes s'affichent à
   l'écran, et tout fonctionne pour montrer le produit.

   Avec le serveur d'Ally, c'est lui qui tranche : mot de passe haché en scrypt,
   session en cookie httpOnly, limitation des tentatives, cloisonnement des
   cabinets. Le navigateur ne garde alors qu'une copie de travail du compte —
   une « ombre » — parce que toute la configuration du cabinet (métier, ton,
   horaires, fiche) est encore locale et qu'il faut bien la ranger quelque part.

   Ce module expose donc une seule interface, à promesses, et choisit le monde
   tout seul. Les deux chemins renvoient exactement la même forme de réponse :
   c'est ce qui permet à login.js et subscribe.js de n'être écrits qu'une fois. */
(function () {
  'use strict';

  var accounts = window.ALLY_ACCOUNTS;
  var api = window.ALLY_API;

  function local() { return !api || !api.online(); }

  /* Un identifiant local stable, dérivé de celui du serveur : le même compte
     retrouve son espace de configuration d'un appareil à l'autre. */
  function shadowId(serverId) { return 'srv-' + serverId; }

  /* Crée ou met à jour la copie locale d'un compte serveur. Renvoie l'objet
     local, celui que les écrans manipulent déjà. */
  function mirror(input) {
    var user = accounts.byId(shadowId(input.serverId)) || accounts.byEmail(input.email);

    if (!user) {
      var made = accounts.signup({
        id: shadowId(input.serverId),
        email: input.email,
        password: input.password || 'mot-de-passe-serveur',
        firstName: input.firstName || '',
        lastName: input.lastName || '',
        org: input.org || '',
        planId: input.planId,
        cycle: input.cycle
      });
      if (!made.ok) return null;
      user = made.user;
    }

    var patch = { serverId: input.serverId, cabinetId: input.cabinetId || user.cabinetId };
    if (input.role) patch.role = input.role;
    if (input.verified) { patch.verified = true; if (user.status === 'pending') patch.status = 'trial'; }
    if (input.planId) patch.planId = input.planId;
    if (input.cycle) patch.cycle = input.cycle;
    return accounts.update(user.id, patch);
  }

  /* Le serveur fait autorité sur le cabinet : sa raison sociale et sa formule.
     Sans cette reprise, l'écran affichait la formule enregistrée dans le
     navigateur — un compte Expert côté serveur pouvait s'annoncer « Cabinet »
     dans son propre espace, avec cinq places dans une carte et une seule dans
     l'autre. */
  function adoptCabinet(cabinet) {
    var store = window.ALLY_STORE;
    if (!store || !cabinet) return;

    var S = store.state;
    var changed = false;

    if (cabinet.org && S.identity.org !== cabinet.org
        && (!S.configured || !S.identity.org)) {
      S.identity.org = cabinet.org;
      changed = true;
    }
    if (cabinet.plan && S.planId !== cabinet.plan) {
      S.planId = cabinet.plan;
      S.plan = window.ALLY_PLAN_BY_ID(cabinet.plan).name;
      changed = true;
    }
    if (cabinet.trade && !S.configured && S.trade !== cabinet.trade) {
      S.trade = cabinet.trade;
      changed = true;
    }
    if (changed) store.save();
  }

  /* Les réponses du serveur portent un message ; les pannes réseau, non. */
  function trouble(response, fallback) {
    return (response && response.body && response.body.error) || fallback;
  }

  function offline() {
    return { ok: false, error: 'Le serveur ne répond pas. Réessayez dans un instant.' };
  }

  /* Toute opération attend d'abord que la sonde ait tranché : cliquer sur
     « Se connecter » une demi-seconde après l'ouverture de la page ne doit pas
     basculer dans le mode local par accident. */
  function when(fn) {
    return (api ? api.ready() : Promise.resolve(false)).then(fn, function () { return fn(false); });
  }

  var GATE = {

    /* Vrai quand c'est le serveur qui décide. Les écrans s'en servent pour
       adapter ce qu'ils annoncent, jamais pour changer de logique. */
    server: function () { return !local(); },
    onReady: function (fn) { if (api) api.onReady(fn); else fn(false); },

    /* Reprend du serveur ce dont il est la source : le cabinet. Appelé au
       chargement des pages qui affichent une formule ou une raison sociale. */
    adopt: function () {
      return when(function () {
        if (local() || !api.cabinetId()) return false;
        return api.me().then(function (res) {
          if (res.ok && res.body.authenticated) adoptCabinet(res.body.cabinet);
          return true;
        }, function () { return false; });
      });
    },

    /* ------------------------------------------------------------ Inscription
       Renvoie { ok, error, user, code }. « code » vaut null quand le serveur
       l'a envoyé par email sans le répéter — c'est le comportement de
       production ; la maquette, elle, l'affiche. */
    signup: function (input) {
      return when(function () {
        if (local()) {
          var made = accounts.signup(input);
          if (!made.ok) return made;
          return { ok: true, user: made.user, code: accounts.issueCode(made.user.id, 'verify') };
        }

        return api.signup({
          email: input.email,
          password: input.password,
          org: input.org || '',
          trade: input.trade || 'avocat',
          plan: input.planId || 'cabinet'
        }).then(function (res) {
          if (!res.ok) return { ok: false, error: trouble(res, 'Inscription refusée.') };

          var user = mirror({
            serverId: res.body.userId, cabinetId: res.body.cabinetId,
            email: input.email, password: input.password,
            firstName: input.firstName, lastName: input.lastName,
            org: input.org, planId: input.planId, cycle: input.cycle
          });
          if (!user) return { ok: false, error: 'Compte créé, mais impossible de l\'ouvrir ici.' };
          return { ok: true, user: user, code: res.body.devCode || null };
        }, function () { return offline(); });
      });
    },

    /* ------------------------------------------------------ Codes à usage unique */
    resend: function (user, kind) {
      return when(function () {
        if (local()) return { ok: true, code: accounts.issueCode(user.id, kind || 'verify') };

        /* Deux routes selon l'intention : « oublié » pour un code de
           réinitialisation, « resend » pour une adresse jamais confirmée. Les
           deux répondent la même chose quoi qu'il arrive, pour ne rien révéler
           de l'existence du compte. */
        var call = kind === 'reset' ? api.forgot(user.email) : api.resend(user.serverId);
        return call.then(function (res) {
          if (!res.ok) return { ok: false, error: trouble(res, 'Impossible de renvoyer le code.') };
          return { ok: true, code: (res.body && res.body.devCode) || null };
        }, function () { return offline(); });
      });
    },

    verify: function (user, code) {
      return when(function () {
        if (local()) {
          var done = accounts.verifyEmail(user.id, code);
          if (done.ok) accounts.open(done.user.id);
          return done;
        }

        return api.verify(user.serverId, code).then(function (res) {
          if (!res.ok) return { ok: false, error: trouble(res, 'Code incorrect.') };
          api.remember({ cabinetId: res.body.cabinetId });

          var mine = mirror({
            serverId: user.serverId, cabinetId: res.body.cabinetId,
            email: user.email, verified: true
          });
          accounts.open((mine || user).id);
          return { ok: true, user: mine || user };
        }, function () { return offline(); });
      });
    },

    /* --------------------------------------------------------------- Connexion
       Renvoie { ok, error, user, code }. Le cas « adresse jamais confirmée »
       n'est pas une erreur : on rend error = 'unverified' avec le compte, pour
       que l'écran reprenne la vérification là où elle s'était arrêtée. */
    login: function (email, password) {
      return when(function () {
        if (local()) return accounts.login(email, password);

        return api.login(email, password).then(function (res) {
          if (res.status === 403 && res.body.error === 'unverified') {
            var waiting = mirror({
              serverId: res.body.userId, email: email, password: password
            });
            return { ok: false, error: 'unverified', user: waiting, code: res.body.devCode || null };
          }
          if (!res.ok) return { ok: false, error: trouble(res, 'Identifiants incorrects.') };

          api.remember({ cabinetId: res.body.cabinetId, role: res.body.role });
          var mine = mirror({
            serverId: res.body.userId || email, cabinetId: res.body.cabinetId,
            role: res.body.role, email: email, password: password, verified: true
          });
          if (!mine) return { ok: false, error: 'Connexion acceptée, mais impossible d\'ouvrir la session ici.' };
          accounts.open(mine.id);
          return { ok: true, user: mine };
        }, function () { return offline(); });
      });
    },

    /* ------------------------------------------------------------ Invitation
       Le collaborateur invité n'a pas encore de mot de passe : il en choisit un
       en prouvant qu'il a reçu le code. Sans serveur, cette route n'existe
       pas — un cabinet à plusieurs suppose un endroit commun. */
    accept: function (userId, code, password) {
      return when(function () {
        if (local()) {
          return { ok: false, error: 'Rejoindre un cabinet demande une ligne connectée.' };
        }
        return api.accept(userId, code, password).then(function (res) {
          if (!res.ok) return { ok: false, error: trouble(res, 'Invitation refusée.') };

          api.remember({ cabinetId: res.body.cabinetId, role: res.body.role });
          var mine = mirror({
            serverId: res.body.userId, cabinetId: res.body.cabinetId,
            email: res.body.email, password: password, verified: true, role: res.body.role
          });
          if (mine) accounts.open(mine.id);
          return { ok: true, user: mine };
        }, function () { return offline(); });
      });
    },

    logout: function () {
      return when(function () {
        accounts.logout();
        if (local()) return { ok: true };
        return api.logout().then(function () { api.forget(); return { ok: true }; },
          function () { api.forget(); return { ok: true }; });
      });
    },

    /* -------------------------------------------------------- Mot de passe oublié
       La réponse est volontairement la même que l'adresse existe ou non : la
       page ne doit pas permettre de découvrir qui est client. */
    forgot: function (email) {
      return when(function () {
        if (local()) return accounts.requestReset(email);

        return api.forgot(email).then(function (res) {
          var userId = res.body && res.body.userId;
          return {
            ok: true,
            user: userId ? { id: shadowId(userId), serverId: userId, email: email } : null,
            code: (res.body && res.body.devCode) || null
          };
        }, function () { return offline(); });
      });
    },

    reset: function (user, code, password) {
      return when(function () {
        if (local()) return accounts.resetPassword(user.id, code, password);

        return api.reset(user.serverId, code, password).then(function (res) {
          if (!res.ok) return { ok: false, error: trouble(res, 'Code incorrect ou expiré.') };
          /* Le mot de passe local suit, sinon l'ombre resterait sur l'ancien le
             jour où le serveur est injoignable. */
          var mine = accounts.byId(shadowId(user.serverId)) || accounts.byEmail(user.email);
          if (mine) accounts.resetLocalPassword(mine.id, password);
          return { ok: true, user: mine || { email: user.email } };
        }, function () { return offline(); });
      });
    }
  };

  window.ALLY_GATE = GATE;
})();
