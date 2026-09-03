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
      /* Numéro attribué par la plateforme, sur lequel Ally décroche. Null tant
         qu'aucune ligne n'est ouverte : les codes de renvoi n'ont alors aucun
         sens, et l'écran le dit au lieu d'afficher un numéro d'exemple qu'on
         composerait pour rien. */
      line: null,
      subscription: null,
      links: { gmail: false, outlook: false, gcal: false, phone: false, sms: true },
      waitlist: [],
      /* Registre d'Ally. Il ne change pas ce qu'elle sait, il change comment
         elle le dit — au téléphone, dans les emails, et dans l'espace pro. */
      tone: 'sobre',
      /* Fiche du cabinet : ce qu'un appelant demande sans jamais avoir besoin
         du professionnel. Chaque champ rempli devient une réponse qu'Ally
         donne seule. */
      sheet: { address: '', access: '', parking: '', payment: '', price: '', delay: '' },
      /* Premiers pas. Cochés automatiquement quand l'action est faite : sans
         renvoi d'appel posé, la ligne ne sonne jamais et le pro conclut que le
         produit ne marche pas. */
      steps: { heard: false, forward: false, calendar: false, sheet: false, dismissed: false },
      /* Journal des gestes du professionnel. C'est la seule base honnête pour
         qu'Ally propose quelque chose : sans lui, une « suggestion » serait
         une invention. Borné à 200 entrées, jamais de contenu métier. */
      history: [],
      /* Suggestions refusées, définitivement. */
      insightsOff: [],
      /* « sample » : jeu de démonstration du métier. « empty » : compte neuf,
         aucune activité — c'est le cas d'un vrai professionnel qui s'inscrit. */
      dataMode: 'sample',
      data: null,
      /* Script d'appel : null tant que le pro ne l'a pas personnalisé, on
         retombe alors sur celui généré pour son métier. */
      script: null
    };
  }

  /* ---- Registres de parole ----
     Le même contenu, dit trois façons. C'est ce qui différencie l'accueil d'un
     cabinet d'avocats de celui d'un plombier, bien plus que le vocabulaire
     métier : personne ne veut d'une secrétaire qui parle comme celle du
     concurrent. */
  var TONES = {
    sobre: {
      label: 'Sobre',
      desc: 'Neutre et professionnel. Le registre attendu dans un cabinet.',
      open: 'Comment puis-je vous aider ?',
      qualify: 'Très bien. Pouvez-vous me préciser votre demande, afin que je vous oriente correctement ?',
      booking: 'Je regarde les disponibilités. Je peux vous proposer un créneau, cela vous convient-il ?',
      unknown: 'Je préfère ne pas répondre à votre place sur ce point. Je note votre demande et {who} vous rappellera. Puis-je avoir votre nom et votre numéro ?',
      closing: 'C\'est noté, je transmets. Merci de votre appel et belle journée.',
      hello: 'Bonjour', mailOpen: 'Madame, Monsieur,'
    },
    chaleureux: {
      label: 'Chaleureux',
      desc: 'Plus humain, plus rassurant. Pour une clientèle de particuliers.',
      open: 'Que puis-je faire pour vous aujourd\'hui ?',
      qualify: 'Je vous écoute. Dites-moi ce qui vous amène, je vais faire le nécessaire.',
      booking: 'Je regarde tout de suite ce qui est libre. Je devrais pouvoir vous trouver quelque chose.',
      unknown: 'Je préfère ne pas m\'avancer sur ce point, vous méritez une vraie réponse. Je note tout et {who} vous rappelle. Votre nom et votre numéro ?',
      closing: 'C\'est noté, je m\'en occupe. Merci de votre appel, très bonne journée à vous.',
      hello: 'Bonjour', mailOpen: 'Bonjour,'
    },
    direct: {
      label: 'Direct',
      desc: 'Court, sans formule. Pour aller vite et ne pas faire attendre.',
      open: 'Je vous écoute.',
      qualify: 'Quel est l\'objet de votre appel ?',
      booking: 'Je consulte l\'agenda. Quel jour vous arrange ?',
      unknown: 'Je ne réponds pas à ça sans {who}. Je prends votre nom et votre numéro, il vous rappelle.',
      closing: 'C\'est noté. Bonne journée.',
      hello: 'Bonjour', mailOpen: 'Bonjour,'
    }
  };

  function toneOf(id) { return TONES[id] || TONES.sobre; }

  /* Script d'appel par défaut, dérivé du métier, de l'identité et du registre. */
  function defaultScript(profile, identity, greeting, toneId) {
    var who = window.ALLY_DISPLAY_NAME(identity, profile);
    var t = toneOf(toneId);
    return [
      { id: 'greeting', label: 'Accueil',
        hint: 'La toute première phrase, dès le décroché.',
        text: greeting },
      { id: 'qualify', label: 'Qualification',
        hint: 'Comment Ally identifie le motif de l\'appel.',
        text: t.qualify },
      { id: 'urgent', label: 'Urgence détectée',
        hint: 'Déclenché dès qu\'une urgence est reconnue. Transfert immédiat.',
        text: 'Je comprends qu\'il s\'agit d\'une urgence. Je vous mets en relation immédiatement avec '
          + who + ', ne quittez pas.' },
      { id: 'booking', label: 'Prise de rendez-vous',
        hint: 'Proposition de créneau, dans vos disponibilités déclarées.',
        text: t.booking },
      { id: 'unknown', label: 'Demande hors périmètre',
        hint: 'Quand Ally ne sait pas répondre : elle prend un message, elle n\'invente pas.',
        text: t.unknown.replace('{who}', who) },
      { id: 'closing', label: 'Clôture',
        hint: 'La phrase de fin, toujours prononcée.',
        text: t.closing }
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

  /* Fenêtre de rétractation après envoi d'un email. */
  var UNDO_MS = 10000;
  var timers = {};

  function clearTimer(id) {
    if (timers[id]) { window.clearTimeout(timers[id]); delete timers[id]; }
  }

  /* Quand une ligne réelle est connectée, valider un brouillon n'est plus une
     simulation : l'email entre dans la file du serveur, qui applique le même
     délai de dix secondes. L'échec est silencieux à dessein — le geste local a
     déjà eu lieu, et rien ne justifie de faire échouer l'écran parce que le
     réseau a hoqueté. La carte « courrier réel » montre l'état vrai. */
  function queueOnServer(store, mail) {
    var api = window.ALLY_API;
    if (!api || !api.online() || !api.cabinetId()) return;

    api.send({
      to: mail.to,
      subject: mail.subject,
      body: mail.preview || mail.body || ''
    }).then(function (res) {
      if (res.ok && res.body.message) {
        mail.serverId = res.body.message.id;
        store.save();
      }
    }).catch(function () {});
  }

  function cancelOnServer(mail) {
    var api = window.ALLY_API;
    if (!api || !api.online() || !mail.serverId) return;
    api.cancel(mail.serverId).catch(function () {});
  }

  function scheduleCommit(store, id, onCommit) {
    clearTimer(id);
    timers[id] = window.setTimeout(function () {
      store.commitSend(id);
      if (onCommit) onCommit();
    }, UNDO_MS);
  }

  /* Jeu de données vivant du compte, initialisé depuis le profil métier.
     C'est lui que l'interface modifie : envoyer un brouillon, annuler un
     rendez-vous ou ajouter une fiche agit vraiment, et survit au rechargement. */
  /* Les rendez-vous d'exemple sont datés du 28 juillet 2026. Affichés tels
     quels un autre mois, ils tombent hors du calendrier : on les décale du
     même nombre de jours pour retrouver leur position relative — aujourd'hui,
     après-demain, la semaine prochaine. */
  var SAMPLE_REF = '2026-07-28';

  function todayISO() {
    var now = new Date();
    var m = now.getMonth() + 1, d = now.getDate();
    return now.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }

  function shiftDate(iso, days) {
    var parts = String(iso).split('-');
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    date.setDate(date.getDate() + days);
    var m = date.getMonth() + 1, d = date.getDate();
    return date.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }

  function dayGap(fromIso, toIso) {
    var a = fromIso.split('-'), b = toIso.split('-');
    var d1 = Date.UTC(a[0], a[1] - 1, a[2]);
    var d2 = Date.UTC(b[0], b[1] - 1, b[2]);
    return Math.round((d2 - d1) / 86400000);
  }

  function seed(trade) {
    var p = window.ALLY_PROFILES[trade];
    var gap = dayGap(SAMPLE_REF, todayISO());
    var rdv = clone(p.rdv);
    rdv.forEach(function (item) { item.date = shiftDate(item.date, gap); });

    return {
      trade: trade,
      calls: clone(p.calls),
      drafts: clone(p.drafts),
      sent: clone(p.sent),
      rdv: rdv,
      faq: clone(p.faq),
      contacts: clone(p.contacts),
      voiceLog: clone(p.voiceLog),
      blocked: []
    };
  }

  /* Compte neuf : aucune activité. La base de connaissances et le contact de
     transfert, eux, viennent du questionnaire — ce sont des réglages, pas de
     l'historique. Afficher les appels d'un inconnu à quelqu'un qui vient de
     s'inscrire est le moyen le plus rapide de lui faire comprendre que rien
     de tout cela n'est à lui. */
  function emptySeed(trade) {
    var p = window.ALLY_PROFILES[trade];
    return {
      trade: trade,
      calls: [], drafts: [], sent: [], rdv: [], voiceLog: [], blocked: [],
      faq: clone(p.faq),
      contacts: [{ id: 1, name: 'Votre portable', reason: 'Transfert des urgences' }]
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

    SAMPLE_REF: SAMPLE_REF,

    /* Données du compte, réensemencées si le métier a changé. */
    data: function () {
      if (!state.data || state.data.trade !== state.trade) {
        state.data = (state.dataMode === 'empty') ? emptySeed(state.trade) : seed(state.trade);
        this.save();
      }
      return state.data;
    },

    /* Un compte neuf n'a encore rien vécu : plusieurs écrans le disent au lieu
       d'afficher des chiffres qui ne sont pas les siens. */
    /* « Neuf » ne veut pas dire « en mode vide » mais « rien ne s'est encore
       passé ». La nuance est apparue le jour où la ligne réelle a commencé à
       remplir un compte vide : l'écran continuait d'annoncer « votre ligne n'a
       pas encore sonné » à quelqu'un dont on affichait les appels. */
    isNew: function () {
      if (state.dataMode !== 'empty') return false;
      var D = this.data();
      return !D.calls.length && !D.rdv.length && !D.drafts.length && !D.sent.length;
    },

    /* Charge le jeu de démonstration du métier, pour voir l'espace pro rempli. */
    loadSample: function () {
      state.dataMode = 'sample';
      state.data = seed(state.trade);
      this.save();
    },

    /* Repart d'un compte vierge, en conservant la configuration. */
    clearActivity: function () {
      state.dataMode = 'empty';
      state.data = emptySeed(state.trade);
      this.save();
    },

    /* Étapes de mise en service, cochées quand l'action est réellement faite. */
    markStep: function (id) {
      if (state.steps[id]) return false;
      state.steps[id] = true;
      this.save();
      return true;
    },

    stepsLeft: function () {
      var done = ['heard', 'forward', 'calendar', 'sheet']
        .filter(function (id) { return state.steps[id]; }).length;
      return 4 - done;
    },

    /* Fiche du cabinet convertie en fiches de connaissance : c'est ce qui fait
       qu'Ally répond « le parking est au 12 rue Victor-Hugo » au lieu de
       prendre un message. */
    sheetEntries: function () {
      var LABELS = {
        address: 'Adresse du cabinet',
        access: 'Comment venir',
        parking: 'Stationnement',
        payment: 'Moyens de paiement',
        price: 'Tarif annoncé',
        delay: 'Délai de réponse'
      };
      return Object.keys(LABELS)
        .filter(function (key) { return String(state.sheet[key] || '').trim(); })
        .map(function (key, index) {
          return { id: 'sheet-' + key, order: index, q: LABELS[key], a: state.sheet[key].trim() };
        });
    },

    sheetFilled: function () { return this.sheetEntries().length; },

    /* Tout ce qu'Ally peut répondre seule : les fiches saisies dans l'espace
       pro, plus la fiche du cabinet. */
    knowledge: function () {
      return this.data().faq.concat(this.sheetEntries());
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
      var limits = this.planData().quota;
      var D = this.data();

      /* Ligne connectée : c'est le serveur qui compte, et lui seul dit vrai.
         Les appels reçus par le webhook et les emails réellement partis. */
      if (this.serverUsage) {
        return {
          calls:  { used: this.serverUsage.calls,    limit: limits.calls },
          emails: { used: this.serverUsage.messages, limit: limits.emails },
          real: true
        };
      }

      /* Compte neuf : la consommation part de zéro. Reprendre celle du profil
         métier afficherait « 142 appels ce mois-ci » à quelqu'un dont la ligne
         n'a jamais sonné. */
      if (state.dataMode === 'empty') {
        return {
          calls:  { used: D.calls.length, limit: limits.calls },
          emails: { used: D.sent.length,  limit: limits.emails }
        };
      }

      var base = this.profile().quota;
      var extraCalls = Math.max(0, D.calls.length - window.ALLY_PROFILES[D.trade].calls.length);
      var extraMails = Math.max(0, D.sent.length - window.ALLY_PROFILES[D.trade].sent.length);
      return {
        calls:  { used: base.calls[0] + extraCalls,  limit: limits.calls },
        emails: { used: base.emails[0] + extraMails, limit: limits.emails }
      };
    },

    /* ---------- Envoi différé ----------
       L'email part, mais reste rattrapable dix secondes. C'est le compromis
       retenu par la plupart des messageries, et le garde-fou qui manquait au
       choix produit « aucune confirmation orale avant envoi » : une erreur de
       transcription ou un mauvais destinataire reste récupérable, sans ajouter
       une étape de validation à chaque envoi. */
    UNDO_MS: UNDO_MS,

    sendMail: function (id, onCommit) {
      var mail = this.data().drafts.filter(function (m) { return m.id === id; })[0];
      if (!mail || mail.sending) return null;
      mail.sending = Date.now();
      this.save();
      queueOnServer(this, mail);
      scheduleCommit(this, id, onCommit);
      return mail;
    },

    /* Email dicté à la voix : il passe par la même fenêtre de rétractation,
       au lieu de partir sans retour possible. */
    sendDirect: function (mail, onCommit) {
      var entry = {
        id: Date.now(), subject: mail.subject, to: mail.to,
        preview: mail.body || '', category: mail.category || 'Dicté à la voix',
        time: 'À l\'instant', sending: Date.now()
      };
      this.data().drafts.unshift(entry);
      this.save();
      queueOnServer(this, entry);
      scheduleCommit(this, entry.id, onCommit);
      return entry;
    },

    commitSend: function (id) {
      var D = this.data();
      var mail = D.drafts.filter(function (m) { return m.id === id; })[0];
      if (!mail) return false;
      D.drafts = D.drafts.filter(function (m) { return m.id !== id; });
      D.sent.unshift({ id: Date.now(), subject: mail.subject, to: mail.to, time: 'À l\'instant' });
      this.record('draft-sent', mail.edited ? 'edited' : 'clean');
      this.log('Envoi de « ' + mail.subject + ' »', 'Email envoyé à ' + mail.to);
      clearTimer(id);
      this.save();
      return true;
    },

    cancelSend: function (id) {
      clearTimer(id);
      var mail = this.data().drafts.filter(function (m) { return m.id === id; })[0];
      if (!mail) return false;
      delete mail.sending;
      cancelOnServer(mail);
      this.record('send-cancelled');
      this.save();
      return true;
    },

    secondsLeft: function (mail) {
      if (!mail || !mail.sending) return 0;
      return Math.max(0, Math.ceil((UNDO_MS - (Date.now() - mail.sending)) / 1000));
    },

    sending: function () {
      return this.data().drafts.filter(function (m) { return !!m.sending; });
    },

    /* ---------- Journal des gestes ---------- */
    record: function (type, detail) {
      state.history.unshift({ t: type, d: detail || '', at: Date.now() });
      if (state.history.length > 200) state.history.length = 200;
      this.save();
    },

    countOf: function (type, detail) {
      return state.history.filter(function (item) {
        return item.t === type && (detail === undefined || item.d === detail);
      }).length;
    },

    /* ---------- Une suggestion, méritée ----------
       Au plus une à la fois, jamais deux fois la même, et refusable
       définitivement. Chacune s'appuie sur des gestes réellement comptés :
       une IA qui suggère au hasard est plus agaçante qu'utile. */
    insight: function () {
      var self = this;
      var off = state.insightsOff;

      var candidates = [
        {
          id: 'auto-send',
          ready: function () {
            return self.countOf('draft-sent', 'clean') >= 4
              && self.countOf('draft-edited') === 0
              && self.countOf('send-cancelled') === 0
              && state.rules.draft;
          },
          text: function () {
            return 'Vous avez validé vos ' + self.countOf('draft-sent', 'clean')
              + ' derniers brouillons sans en modifier un seul. Je peux les envoyer '
              + 'directement, et vous garderez dix secondes pour me rattraper.';
          },
          action: 'Envoyer directement',
          apply: function () { state.rules.draft = false; self.save(); }
        },
        {
          id: 'fill-sheet',
          ready: function () {
            return self.countOf('call-note') >= 3 && self.sheetFilled() < 3;
          },
          text: function () {
            return self.countOf('call-note') + ' appelants ont eu droit à une prise de '
              + 'message parce que je n\'avais pas l\'information. Votre adresse, votre '
              + 'tarif et vos moyens de paiement suffiraient à traiter la plupart.';
          },
          action: 'Remplir la fiche',
          go: 'ally'
        },
        {
          id: 'review-again',
          ready: function () { return self.countOf('send-cancelled') >= 2; },
          text: function () {
            return 'Vous avez rattrapé ' + self.countOf('send-cancelled') + ' envois de '
              + 'justesse. Je peux repasser en validation systématique : vous relirez '
              + 'avant, plutôt que de courir après.';
          },
          action: 'Repasser en validation',
          apply: function () { state.rules.draft = true; self.save(); }
        }
      ];

      for (var i = 0; i < candidates.length; i++) {
        var item = candidates[i];
        if (off.indexOf(item.id) >= 0) continue;
        if (item.ready()) return item;
      }
      return null;
    },

    dismissInsight: function (id) {
      if (state.insightsOff.indexOf(id) < 0) state.insightsOff.push(id);
      this.save();
    },

    /* ---------- Forfait ----------
       Décision produit : on ne coupe jamais la ligne. Un appel refusé, c'est
       un client perdu pour le cabinet, et c'est nous qu'il rendra responsable.
       Au-delà du forfait, les appels passent et sont facturés au détail, avec
       un avertissement dès 80 %. */
    quotaState: function () {
      var usage = this.usage();
      var ratio = usage.calls.limit ? usage.calls.used / usage.calls.limit : 0;
      var over = Math.max(0, usage.calls.used - usage.calls.limit);
      return {
        ratio: ratio,
        used: usage.calls.used,
        limit: usage.calls.limit,
        over: over,
        cost: over * this.planData().overage,
        level: ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok'
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

    TONES: TONES,

    /* Registre de parole courant. */
    tone: function () { return toneOf(state.tone); },

    setTone: function (id) {
      if (!TONES[id]) return;
      state.tone = id;
      /* Le script suit le registre tant que le pro ne l'a pas réécrit lui-même :
         changer de ton sans que rien ne change à l'écran serait un réglage
         décoratif de plus. */
      if (!state.script) state.greeting = '';
      this.save();
    },

    /* Script d'accueil : celui saisi par le pro, sinon celui du métier, dit
       dans le registre choisi. */
    greeting: function () {
      if (state.greeting) return state.greeting;
      var base = this.profile().greeting({ org: state.identity.org, name: this.displayName() });
      var t = this.tone();
      /* Les profils terminent par « Comment puis-je vous aider aujourd'hui ? ».
         On remplace cette dernière question par celle du registre. */
      return base.replace(/[^.!?]*\?\s*$/, '').trim() + ' ' + t.open;
    },

    /* Script d'appel courant : celui du pro, sinon celui de son métier. */
    script: function () {
      if (state.script && state.script.length) return state.script;
      return defaultScript(this.profile(), state.identity, this.greeting(), state.tone);
    },

    resetScript: function () {
      state.script = defaultScript(this.profile(), state.identity, this.greeting(), state.tone);
      this.save();
      return state.script;
    },

    voiceOptions: function () {
      return { voiceURI: state.voice.uri, rate: state.voice.rate, pitch: state.voice.pitch };
    },

    save: function () {
      var ok;
      try { window.localStorage.setItem(KEY, JSON.stringify(state)); ok = true; }
      catch (e) { ok = false; }

      /* La configuration appartient au cabinet, pas à l'appareil : elle part
         au serveur quand il y en a un. Le module de synchronisation
         temporise — on enregistre à chaque frappe dans un champ. */
      if (window.ALLY_CONFIG_SYNC) window.ALLY_CONFIG_SYNC.touch();
      return ok;
    },

    /* Les champs qui décrivent le cabinet, par opposition à son activité.
       C'est cette liste qui voyage d'un appareil à l'autre : ni les appels, ni
       les emails, ni l'historique des gestes — ceux-là ont déjà leur route. */
    configFields: function () {
      return ['identity', 'trade', 'hours', 'closures', 'survey', 'rules',
        'autonomy', 'greeting', 'notif', 'retentionDays', 'summaryFreq',
        'voiceEnabled', 'confirmLevel', 'chatSpeaks', 'voice', 'tone', 'sheet',
        'steps', 'script', 'configured', 'links'];
    },

    configSnapshot: function () {
      var out = {};
      this.configFields().forEach(function (key) {
        if (state[key] !== undefined) out[key] = state[key];
      });
      return out;
    },

    applyConfig: function (config) {
      if (!config) return false;
      var self = this;
      this.configFields().forEach(function (key) {
        if (config[key] !== undefined) state[key] = config[key];
      });
      /* On enregistre sans repasser par save() : inutile de renvoyer au
         serveur ce qu'on vient d'en recevoir. */
      try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
      return true;
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
        /* Compte réel connecté et jamais configuré ici : il démarre vide. Le
           compte de démonstration anonyme, lui, garde son jeu d'exemple pour
           rester consultable sans inscription. */
        if (!stored) fresh.dataMode = 'empty';
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

  /* Un email laissé « en cours d'envoi » au moment où l'onglet a été fermé est
     bel et bien parti : les dix secondes se sont écoulées sans rétractation.
     Le laisser en attente au rechargement donnerait un brouillon fantôme. */
  (function () {
    var pending = window.ALLY_STORE.sending();
    if (!pending.length) return;
    pending.forEach(function (mail) { window.ALLY_STORE.commitSend(mail.id); });
  })();

  /* Repart du questionnaire. Le fichier de démonstration autonome remplace
     cette fonction par un simple rechargement, puisqu'il n'a pas de pages. */
  window.ALLY_RESTART = function () { window.location.href = 'onboarding.html'; };
})();
