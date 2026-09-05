/* Ally — annuaire des comptes, rôles et session.

   AVERTISSEMENT : maquette front. Les mots de passe sont « hachés » ici par une
   fonction non cryptographique, uniquement pour éviter de les écrire en clair
   dans le navigateur. Ce n'est PAS de la sécurité. En production, le hachage se
   fait côté serveur avec argon2id, et rien de tout ceci ne vit dans le
   navigateur. Voir ARCHITECTURE.md § Sécuriser Ally. */
(function () {
  'use strict';

  var KEY = 'ally.users.v1';
  var ONLINE_MS = 5 * 60 * 1000;   /* considéré connecté sous 5 minutes */
  var CODE_TTL = 10 * 60 * 1000;   /* validité d'un code à usage unique */

  /* Compte administrateur livré avec la maquette. À changer avant toute mise
     en ligne — il est volontairement visible sur l'écran de connexion. */
  var ADMIN = { email: 'admin@ally.fr', password: 'ally-admin-2026' };

  function now() { return Date.now(); }
  function uid() { return 'u' + now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function days(n) { return n * 86400000; }

  /* Hachage de démonstration. Voir l'avertissement en tête de fichier. */
  function hash(text) {
    var h = 5381, i;
    text = 'ally.' + String(text);
    for (i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
    return 'd$' + h.toString(36);
  }

  function code6() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  function normalize(email) { return String(email || '').trim().toLowerCase(); }

  /* ---------- Comptes de démonstration ----------
     L'admin a besoin de voir une plateforme vivante : des formules variées,
     des essais en cours, des comptes suspendus, des dates d'inscription
     étalées sur l'année. Sans ça, la console d'administration ne montre rien. */
  var DEMO = [
    ['Camille', 'Roux',     'Cabinet Roux',              'avocat',   'expert',     'active',    318, 3,    { calls: 942, emails: 2610, minutes: 1880 }],
    ['Sofiane', 'Benali',   'Benali Avocats',            'avocat',   'cabinet',    'active',    266, 0.02, { calls: 381, emails: 1104, minutes: 762 }],
    ['Hélène',  'Marchand', 'Cabinet Marchand',          'avocat',   'cabinet',    'active',    241, 1,    { calls: 355, emails: 980,  minutes: 690 }],
    ['Julien',  'Ferrand',  'Ferrand & Associés',        'avocat',   'expert',     'active',    203, 0.1,  { calls: 1108, emails: 3320, minutes: 2210 }],
    ['Nadia',   'Cherif',   'Cabinet Cherif',            'avocat',   'cabinet',    'active',    177, 6,    { calls: 298, emails: 812,  minutes: 601 }],
    ['Marc',    'Lévêque',  'Étude Lévêque',             'avocat',   'permanence', 'active',    154, 2,    { calls: 132, emails: 96,   minutes: 210 }],
    ['Inès',    'Fabre',    'Docteur Fabre',             'medecin',  'cabinet',    'active',    131, 0.03, { calls: 402, emails: 640,  minutes: 810 }],
    ['Thomas',  'Girard',   'Girard Conseil',            'consultant','cabinet',   'active',    112, 4,    { calls: 214, emails: 1420, minutes: 430 }],
    ['Aurélie', 'Vasseur',  'Cabinet Vasseur',           'avocat',   'cabinet',    'active',     88, 0.5,  { calls: 276, emails: 903,  minutes: 552 }],
    ['Karim',   'Haddad',   'Haddad Plomberie',          'artisan',  'permanence', 'active',     74, 9,    { calls: 148, emails: 62,   minutes: 232 }],
    ['Léa',     'Dumas',    'Docteur Dumas',             'medecin',  'expert',     'active',     61, 0.08, { calls: 1290, emails: 2140, minutes: 2480 }],
    ['Olivier', 'Perrin',   'Perrin Avocat',             'avocat',   'cabinet',    'suspended',  57, 42,   { calls: 90,  emails: 210,  minutes: 178 }],
    ['Manon',   'Aubry',    'Cabinet Aubry',             'avocat',   'cabinet',    'trial',      11, 0.2,  { calls: 38,  emails: 74,   minutes: 71 }],
    ['Rémi',    'Colin',    'Colin Ébénisterie',         'artisan',  'permanence', 'trial',       6, 1.5,  { calls: 21,  emails: 8,    minutes: 33 }],
    ['Sarah',   'Nguyen',   'Nguyen & Partners',         'consultant','cabinet',   'trial',       3, 0.01, { calls: 12,  emails: 47,   minutes: 26 }],
    ['Paul',    'Rivière',  'Étude Rivière',             'avocat',   'cabinet',    'pending',     1, 999,  { calls: 0,   emails: 0,    minutes: 0 }]
  ];

  function demoUsers() {
    var list = DEMO.map(function (row, index) {
      var created = now() - days(row[6]);
      return {
        id: 'demo' + (index + 1),
        role: 'pro',
        email: (row[0] + '.' + row[1] + '@' + row[2].toLowerCase()
                 .replace(/[éèê]/g, 'e').replace(/[^a-z]+/g, '') + '.fr')
                 .toLowerCase().replace(/[éèê]/g, 'e'),
        pass: hash('demo1234'),
        civility: ['Camille', 'Hélène', 'Nadia', 'Inès', 'Aurélie', 'Léa', 'Manon', 'Sarah']
          .indexOf(row[0]) >= 0 ? 'Mme' : 'M.',
        firstName: row[0], lastName: row[1], org: row[2],
        trade: row[3], planId: row[4], cycle: index % 4 === 0 ? 'year' : 'month',
        status: row[5],
        createdAt: created,
        /* Une dernière visite ne peut pas précéder la création du compte :
           sans ce plancher, un compte inscrit hier affichait « il y a 33 mois ». */
        lastSeenAt: Math.max(created, now() - days(row[7])),
        verified: row[5] !== 'pending',
        onboarded: row[5] !== 'pending',
        survey: null,
        usage: row[8],
        code: null
      };
    });

    list.unshift({
      id: 'admin',
      role: 'admin',
      email: ADMIN.email,
      pass: hash(ADMIN.password),
      civility: 'M.', firstName: 'Administrateur', lastName: 'Ally', org: 'Ally',
      trade: 'avocat', planId: 'expert', cycle: 'year', status: 'active',
      createdAt: now() - days(365), lastSeenAt: now(),
      verified: true, onboarded: true, survey: null,
      usage: { calls: 0, emails: 0, minutes: 0 }, code: null
    });

    return list;
  }

  function blank() {
    return { users: demoUsers(), sessionId: null, events: [] };
  }

  var db = blank();
  try {
    var raw = window.localStorage.getItem(KEY);
    if (raw) {
      var saved = JSON.parse(raw);
      if (saved && Array.isArray(saved.users) && saved.users.length) {
        db = { users: saved.users, sessionId: saved.sessionId || null,
               events: Array.isArray(saved.events) ? saved.events : [] };
      }
    }
  } catch (e) { /* localStorage indisponible : annuaire en mémoire seule */ }

  function persist() {
    try { window.localStorage.setItem(KEY, JSON.stringify(db)); return true; }
    catch (e) { return false; }
  }

  function find(predicate) {
    for (var i = 0; i < db.users.length; i++) if (predicate(db.users[i])) return db.users[i];
    return null;
  }

  function record(action, detail, userId) {
    db.events.unshift({ at: now(), action: action, detail: detail || '', userId: userId || null });
    if (db.events.length > 120) db.events.length = 120;
  }

  var API = {
    ADMIN: ADMIN,
    ONLINE_MS: ONLINE_MS,

    all: function () { return db.users; },
    pros: function () { return db.users.filter(function (u) { return u.role === 'pro'; }); },
    byId: function (id) { return find(function (u) { return u.id === id; }); },
    byEmail: function (email) {
      var target = normalize(email);
      return find(function (u) { return normalize(u.email) === target; });
    },

    current: function () { return db.sessionId ? this.byId(db.sessionId) : null; },
    currentId: function () { return db.sessionId; },
    isAdmin: function () { var u = this.current(); return !!u && u.role === 'admin'; },

    /* Clé de stockage du compte : chaque professionnel a sa propre
       configuration, sinon deux comptes du même navigateur se mélangent. */
    suffix: function () { return db.sessionId ? ':' + db.sessionId : ''; },

    /* ---------- Inscription ---------- */
    signup: function (input) {
      var email = normalize(input.email);
      if (!email || email.indexOf('@') < 1) return { ok: false, error: 'Adresse email invalide.' };
      if (this.byEmail(email)) {
        return { ok: false, error: 'Un compte existe déjà avec cette adresse.' };
      }
      if (!input.password || input.password.length < 8) {
        return { ok: false, error: 'Le mot de passe doit faire au moins 8 caractères.' };
      }

      var user = {
        /* L'identifiant peut être imposé : quand le serveur tient les comptes,
           la copie locale porte un identifiant dérivé du sien, pour que le même
           compte retrouve sa configuration d'un appareil à l'autre. */
        id: input.id && !this.byId(input.id) ? input.id : uid(),
        role: 'pro', email: email, pass: hash(input.password),
        civility: input.civility || 'M.',
        firstName: (input.firstName || '').trim(),
        lastName: (input.lastName || '').trim(),
        org: (input.org || '').trim(),
        trade: input.trade || 'avocat',
        planId: input.planId || 'cabinet',
        cycle: input.cycle || 'month',
        status: 'pending',
        createdAt: now(), lastSeenAt: now(),
        verified: false, onboarded: false, survey: null,
        usage: { calls: 0, emails: 0, minutes: 0 },
        code: null
      };
      db.users.push(user);
      record('signup', user.email + ' — formule ' + user.planId, user.id);
      persist();
      return { ok: true, user: user };
    },

    /* ---------- Codes à usage unique ---------- */
    issueCode: function (userId, kind) {
      var user = this.byId(userId);
      if (!user) return null;
      user.code = { kind: kind, value: code6(), expires: now() + CODE_TTL, tries: 0 };
      record(kind === 'reset' ? 'reset-code' : 'verify-code', user.email, user.id);
      persist();
      return user.code.value;
    },

    checkCode: function (userId, kind, value) {
      var user = this.byId(userId);
      if (!user || !user.code || user.code.kind !== kind) {
        return { ok: false, error: 'Aucun code en attente. Demandez-en un nouveau.' };
      }
      if (now() > user.code.expires) {
        return { ok: false, error: 'Ce code a expiré. Demandez-en un nouveau.' };
      }
      user.code.tries += 1;
      if (user.code.tries > 5) {
        user.code = null;
        persist();
        return { ok: false, error: 'Trop de tentatives. Demandez un nouveau code.' };
      }
      if (String(value).trim() !== user.code.value) {
        persist();
        return { ok: false, error: 'Code incorrect. Il reste ' + (6 - user.code.tries) + ' essai(s).' };
      }
      return { ok: true, user: user };
    },

    verifyEmail: function (userId, value) {
      var result = this.checkCode(userId, 'verify', value);
      if (!result.ok) return result;
      result.user.verified = true;
      result.user.status = 'trial';
      result.user.code = null;
      record('verified', result.user.email, result.user.id);
      persist();
      return { ok: true, user: result.user };
    },

    /* ---------- Connexion ---------- */
    /* Un seul et même refus pour une adresse inconnue et un mot de passe faux.
       Distinguer les deux — « Aucun compte à cette adresse » d'un côté,
       « Mot de passe incorrect » de l'autre — permet d'essayer des adresses
       une à une jusqu'à trouver lesquelles ont un compte. Chez un avocat, ce
       n'est pas une liste d'emails : c'est la liste de ses confrères clients
       d'Ally, et elle se constitue sans jamais deviner un mot de passe.

       Le serveur applique déjà cette règle, avec en plus une comparaison à
       durée constante. Ce module-ci prend le relais quand aucun serveur ne
       répond : il n'y avait aucune raison qu'il soit plus bavard.

       La suspension, elle, ne se dit qu'à quelqu'un qui a donné le bon mot de
       passe — sinon elle rétablit exactement la fuite qu'on vient de fermer. */
    login: function (email, password) {
      var user = this.byEmail(email);
      var REFUS = { ok: false, error: 'Adresse ou mot de passe incorrect.' };

      if (!user) {
        /* On hache quand même : le temps de réponse ne doit pas trahir non
           plus ce que le message tait. */
        hash(String(password || ''));
        return REFUS;
      }
      if (user.pass !== hash(password)) {
        record('login-failed', user.email, user.id);
        persist();
        return REFUS;
      }
      if (user.status === 'suspended') {
        return { ok: false, error: 'Ce compte est suspendu. Contactez le support.' };
      }
      if (!user.verified) return { ok: false, error: 'unverified', user: user };

      db.sessionId = user.id;
      user.lastSeenAt = now();
      record('login', user.email, user.id);
      persist();
      return { ok: true, user: user };
    },

    logout: function () {
      var user = this.current();
      if (user) record('logout', user.email, user.id);
      db.sessionId = null;
      persist();
    },

    /* Ouvre la session sans mot de passe — utilisé juste après la vérification
       du code d'inscription, où l'identité vient d'être prouvée. */
    open: function (userId) {
      var user = this.byId(userId);
      if (!user) return false;
      db.sessionId = user.id;
      user.lastSeenAt = now();
      persist();
      return true;
    },

    /* ---------- Mot de passe oublié ---------- */
    requestReset: function (email) {
      var user = this.byEmail(email);
      /* On ne dit jamais si l'adresse existe : sinon la page devient un outil
         pour découvrir qui est client. Le code n'est émis que si le compte
         existe, mais l'écran affiche le même message dans les deux cas. */
      if (!user) return { ok: true, user: null, code: null };
      return { ok: true, user: user, code: this.issueCode(user.id, 'reset') };
    },

    resetPassword: function (userId, value, password) {
      if (!password || password.length < 8) {
        return { ok: false, error: 'Le mot de passe doit faire au moins 8 caractères.' };
      }
      var result = this.checkCode(userId, 'reset', value);
      if (!result.ok) return result;
      result.user.pass = hash(password);
      result.user.code = null;
      record('password-reset', result.user.email, result.user.id);
      persist();
      return { ok: true, user: result.user };
    },

    /* Change le mot de passe local sans code : réservé au cas où le serveur
       vient d'accepter la réinitialisation et l'a déjà validée, lui. */
    resetLocalPassword: function (userId, password) {
      var user = this.byId(userId);
      if (!user || !password || password.length < 8) return false;
      user.pass = hash(password);
      user.code = null;
      persist();
      return true;
    },

    /* ---------- Mise à jour ---------- */
    update: function (userId, patch) {
      var user = this.byId(userId);
      if (!user) return null;
      Object.keys(patch).forEach(function (key) { user[key] = patch[key]; });
      persist();
      return user;
    },

    touch: function () {
      var user = this.current();
      if (!user) return;
      user.lastSeenAt = now();
      persist();
    },

    remove: function (userId) {
      var user = this.byId(userId);
      if (!user || user.role === 'admin') return false;
      db.users = db.users.filter(function (u) { return u.id !== userId; });
      if (db.sessionId === userId) db.sessionId = null;
      try { window.localStorage.removeItem('ally.account.v1:' + userId); } catch (e) {}
      record('deleted', user.email, null);
      persist();
      return true;
    },

    isOnline: function (user) { return (now() - (user.lastSeenAt || 0)) < ONLINE_MS; },

    events: function () { return db.events; },
    log: function (action, detail) {
      var user = this.current();
      record(action, detail, user ? user.id : null);
      persist();
    },

    /* ---------- Statistiques plateforme ---------- */
    stats: function () {
      var pros = this.pros();
      var self = this;
      var byStatus = { active: 0, trial: 0, suspended: 0, pending: 0 };
      var byPlan = {}, byTrade = {};
      var mrr = 0, trialMrr = 0, calls = 0, emails = 0, minutes = 0, online = 0;

      window.ALLY_PLANS.forEach(function (p) {
        byPlan[p.id] = { plan: p, count: 0, active: 0, mrr: 0 };
      });
      Object.keys(window.ALLY_PROFILES).forEach(function (t) { byTrade[t] = 0; });

      pros.forEach(function (user) {
        byStatus[user.status] = (byStatus[user.status] || 0) + 1;
        if (byTrade[user.trade] === undefined) byTrade[user.trade] = 0;
        byTrade[user.trade] += 1;

        var plan = window.ALLY_PLAN_BY_ID(user.planId);
        /* Un abonnement annuel se compare en base mensuelle, sinon le revenu
           récurrent n'a plus de sens. */
        var monthly = user.cycle === 'year' ? Math.round(plan.priceYear / 12) : plan.price;

        if (byPlan[plan.id]) byPlan[plan.id].count += 1;
        if (user.status === 'active') {
          mrr += monthly;
          if (byPlan[plan.id]) {
            byPlan[plan.id].mrr += monthly;
            byPlan[plan.id].active += 1;
          }
        } else if (user.status === 'trial') {
          trialMrr += monthly;
        }

        calls += user.usage.calls;
        emails += user.usage.emails;
        minutes += user.usage.minutes;
        if (self.isOnline(user)) online += 1;
      });

      /* Coût de revient : le fixe (hébergement) plus le variable par compte
         actif, aux ordres de grandeur retenus dans ARCHITECTURE.md. */
      var COST_FIXED = 45;
      var COST_PER_ACTIVE = 12;
      var COST_PER_TRIAL = 7;
      var cost = COST_FIXED + byStatus.active * COST_PER_ACTIVE + byStatus.trial * COST_PER_TRIAL;

      return {
        total: pros.length,
        online: online,
        byStatus: byStatus,
        byPlan: byPlan,
        byTrade: byTrade,
        mrr: mrr,
        arr: mrr * 12,
        trialMrr: trialMrr,
        arpu: byStatus.active ? Math.round(mrr / byStatus.active) : 0,
        calls: calls, emails: emails, minutes: minutes,
        cost: cost,
        margin: mrr - cost,
        marginRate: mrr ? Math.round(((mrr - cost) / mrr) * 100) : 0,
        signups: this.signupsByMonth()
      };
    },

    /* Inscriptions des 12 derniers mois, du plus ancien au plus récent. */
    signupsByMonth: function () {
      var buckets = [], reference = new Date(), i;
      for (i = 11; i >= 0; i--) {
        var date = new Date(reference.getFullYear(), reference.getMonth() - i, 1);
        buckets.push({
          key: date.getFullYear() + '-' + date.getMonth(),
          label: date.toLocaleDateString('fr-FR', { month: 'short' }),
          count: 0
        });
      }
      this.pros().forEach(function (user) {
        var date = new Date(user.createdAt);
        var key = date.getFullYear() + '-' + date.getMonth();
        buckets.forEach(function (bucket) { if (bucket.key === key) bucket.count += 1; });
      });
      return buckets;
    },

    /* Remet l'annuaire à son état de démonstration. */
    reseed: function () {
      db = blank();
      persist();
    }
  };

  /* Libellé relatif — « il y a 3 min », « il y a 2 j ». */
  window.ALLY_SINCE = function (timestamp) {
    if (!timestamp) return '—';
    var delta = Math.max(0, now() - timestamp);
    var minutes = Math.floor(delta / 60000);
    if (minutes < 1) return 'à l\'instant';
    if (minutes < 60) return 'il y a ' + minutes + ' min';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return 'il y a ' + hours + ' h';
    var d = Math.floor(hours / 24);
    if (d < 31) return 'il y a ' + d + ' j';
    var months = Math.floor(d / 30);
    return 'il y a ' + months + ' mois';
  };

  window.ALLY_DATE = function (timestamp) {
    if (!timestamp) return '—';
    return new Date(timestamp).toLocaleDateString('fr-FR',
      { day: '2-digit', month: 'short', year: 'numeric' });
  };

  window.ALLY_ACCOUNTS = API;
})();
