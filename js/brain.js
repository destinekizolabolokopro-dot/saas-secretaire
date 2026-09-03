/* Ally — moteur de compréhension partagé.
   Un seul cerveau alimente la commande vocale, le chat écrit et la simulation
   d'appel : les trois comprennent les mêmes demandes et puisent dans les mêmes
   données (base de connaissances, agenda, brouillons, appels, règles).
   Ce n'est pas un modèle de langage : c'est un moteur d'intentions déterministe,
   donc auditable — ce qui est le bon choix pour un métier à secret professionnel. */
(function () {
  'use strict';

  /* Normalise pour comparer : minuscules, sans accents, sans ponctuation. */
  function norm(text) {
    return String(text).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/['’]/g, ' ')
      .replace(/[^a-z0-9\s:]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function hasAll(text, words) {
    return words.every(function (w) { return text.indexOf(w) !== -1; });
  }
  function hasAny(text, words) {
    return words.some(function (w) { return text.indexOf(w) !== -1; });
  }

  /* ---------- Tolérance aux fautes ----------

     On tape « rendez vou », on dicte « rendé vous », le micro rend « rendez
     vou » : trois façons d'échouer sur la demande la plus courante du produit.
     Une distance d'édition de 1 sur les mots d'au moins cinq lettres rattrape
     l'essentiel — une lettre en trop, en moins, inversée ou fausse — sans
     confondre des mots réellement différents.

     Volontairement limité : deux erreurs dans un même mot restent une demande
     qu'on ne comprend pas, et il vaut mieux le dire que deviner de travers. */
  function distance(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 2;
    var ligne = [], i, j;
    for (j = 0; j <= b.length; j++) ligne[j] = j;
    for (i = 1; i <= a.length; i++) {
      var precedent = ligne[0];
      ligne[0] = i;
      for (j = 1; j <= b.length; j++) {
        var garde = ligne[j];
        ligne[j] = Math.min(
          ligne[j] + 1,
          ligne[j - 1] + 1,
          precedent + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
        precedent = garde;
      }
    }
    return ligne[b.length];
  }

  function motProche(mot, cible) {
    if (mot === cible) return true;
    if (cible.length < 5) return false;
    if (Math.abs(mot.length - cible.length) > 1) return false;
    return distance(mot, cible) <= 1;
  }

  /* Comme hasAny, mais en pardonnant une faute de frappe. Les expressions à
     plusieurs mots sont comparées mot à mot, dans l'ordre. */
  function hasAnyLoose(text, words) {
    if (hasAny(text, words)) return true;
    var dits = text.split(' ');

    return words.some(function (attendu) {
      var parts = attendu.split(' ');
      for (var i = 0; i + parts.length <= dits.length; i++) {
        var tout = true;
        for (var j = 0; j < parts.length; j++) {
          if (!motProche(dits[i + j], parts[j])) { tout = false; break; }
        }
        if (tout) return true;
      }
      return false;
    });
  }

  /* Le vocabulaire du rendez-vous revient partout : on le nomme une fois.
     « vous » ne fait que quatre lettres, en dessous du seuil de tolérance —
     on écrit donc à la main les fautes que tout le monde fait sur le mot le
     plus utilisé du produit, plutôt que d'abaisser le seuil et de confondre
     « mais » avec « mail ». */
  var MOTS_RDV = ['rendez vous', 'rendezvous', 'rendez vou', 'rendes vous',
    'rdv', 'rdvs', 'consultation', 'creneau', 'agenda'];
  function parleDeRdv(t) { return hasAnyLoose(t, MOTS_RDV); }

  /* Mots qui déclenchent un transfert pendant un appel.
     « urgent » et « urgence » sont irréductibles : un appelant qui le dit
     explicitement doit toujours être entendu. Le reste vient du questionnaire —
     les motifs cochés apportent leur vocabulaire métier, et le professionnel
     peut en ajouter à la main. */
  var CORE_URGENCY = ['urgence', 'urgent'];

  function urgencyWords() {
    var store = window.ALLY_STORE;
    var chosen = store.state.survey.urgency || { motifs: [], words: '' };
    var list = CORE_URGENCY.slice();
    var trade = store.profile().urgencies || [];

    /* Aucun motif enregistré : le questionnaire n'a pas été fait, ou l'étape a
       été passée. On prend alors tous les motifs du métier — c'est le
       comportement le plus prudent, et celui que le questionnaire propose par
       défaut. Retenir la liste vide reviendrait à désactiver silencieusement la
       détection d'urgence pour qui n'a rien réglé. */
    var selected = chosen.motifs.length
      ? trade.filter(function (item) { return chosen.motifs.indexOf(item.label) >= 0; })
      : trade;

    selected.forEach(function (item) {
      item.words.forEach(function (word) {
        if (list.indexOf(word) < 0) list.push(word);
      });
    });

    String(chosen.words || '').split(',').forEach(function (word) {
      var clean = norm(word);
      if (clean && list.indexOf(clean) < 0) list.push(clean);
    });

    return list;
  }

  /* Extrait une heure : « 14h », « 14 h 30 », « 9:30 ». */
  function findTime(text) {
    var m = text.match(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?/);
    if (!m) return null;
    var h = parseInt(m[1], 10);
    var min = m[2] ? m[2] : '00';
    if (h > 23) return null;
    return (h < 10 ? '0' + h : h) + ':' + min;
  }

  var DAYS = [
    ['lundi', 'lun'], ['mardi', 'mar'], ['mercredi', 'mer'], ['jeudi', 'jeu'],
    ['vendredi', 'ven'], ['samedi', 'sam'], ['dimanche', 'dim']
  ];
  function findDay(text) {
    for (var i = 0; i < DAYS.length; i++) {
      if (text.indexOf(DAYS[i][0]) !== -1) return DAYS[i][0];
    }
    if (text.indexOf('apres demain') !== -1) return 'après-demain';
    if (text.indexOf('demain') !== -1) return 'demain';
    return null;
  }

  /* ---------- Outils de créneau ---------- */

  function decale(isoDate, jours) {
    var p = String(isoDate).split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    d.setDate(d.getDate() + jours);
    var m = d.getMonth() + 1, j = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j;
  }

  function enMinutes(hhmm) {
    var p = String(hhmm).split(':');
    return Number(p[0]) * 60 + Number(p[1] || 0);
  }

  function enHeure(minutes) {
    var h = Math.floor(minutes / 60), m = minutes % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function heureCourante() {
    var d = new Date();
    return enHeure(d.getHours() * 60 + d.getMinutes());
  }

  /* Les trous d'un jour donné, dans les horaires déclarés, une fois retirés
     les rendez-vous et les demi-journées bloquées. */
  function creneauxLibres(isoDate, duree) {
    var store = window.ALLY_STORE;
    var A = window.ALLY_AGENDA;
    var p = String(isoDate).split('-');
    var jourSemaine = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getDay();
    var cles = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

    var plage = store.state.hours.filter(function (h) {
      return h.id === cles[jourSemaine] && h.on;
    })[0];
    if (!plage) return [];

    var bloque = (store.data().blocked || []).some(function (b) { return b.date === isoDate; });
    if (bloque) return [];

    var pris = A.rdvOn(isoDate).map(function (r) { return enMinutes(r.time); });
    var debut = enMinutes(plage.from);
    var fin = enMinutes(plage.to);
    var maintenant = isoDate === A.TODAY ? enMinutes(heureCourante()) : -1;

    var libres = [];
    for (var m = debut; m + duree <= fin; m += 30) {
      if (m < maintenant) continue;
      var occupe = pris.some(function (debutRdv) {
        return m < debutRdv + duree && debutRdv < m + duree;
      });
      if (!occupe) libres.push(enHeure(m));
    }
    return libres;
  }

  /* Le jour, dit comme on le dit. « auj » et « dem » sont des abréviations de
     tableau : à l'oral comme à l'écrit, on dit « aujourd'hui » et « demain ». */
  function quandDit(isoDate) {
    var A = window.ALLY_AGENDA;
    if (isoDate === A.TODAY) return 'aujourd\'hui';
    if (isoDate === decale(A.TODAY, 1)) return 'demain';
    if (isoDate === decale(A.TODAY, 2)) return 'après-demain';
    return A.longLabel(isoDate);
  }

  /* Le nom cherché dans « avec Mme Aubert », « rappelle M. Petit ». On reprend
     le texte d'origine : la casse et les accents aident à reconnaître un nom. */
  function nomCherche(input) {
    var m = String(input).match(/\b(?:avec|de|pour|à|a)\s+((?:M\.|Mme|Mlle|Dr|Me)?\s*[A-ZÉÈÀÂÎÔÙ][\wÀ-ÿ-]+)/);
    if (m) return norm(m[1]).replace(/^(m|mme|mlle|dr|me)\s+/, '').trim();

    /* Dernier recours : un mot capitalisé qui n'est pas en début de phrase. */
    var mots = String(input).trim().split(/\s+/).slice(1);
    for (var i = 0; i < mots.length; i++) {
      if (/^[A-ZÉÈÀÂÎÔÙ][\wÀ-ÿ-]{2,}$/.test(mots[i])) return norm(mots[i]);
    }
    return null;
  }

  /* ---------- Dates dites comme on les dit ----------

     « le 14 septembre », « le 14 », « dans trois jours », « la semaine
     prochaine », « lundi prochain » : autant de formulations naturelles qui
     retombaient toutes sur aujourd'hui, ce qui posait le rendez-vous au mauvais
     jour sans rien signaler. Renvoie une date ISO, ou null si la phrase ne
     parle pas d'un jour précis. */
  var MOIS_NOMS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet',
    'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

  function iso(d) {
    var m = d.getMonth() + 1, j = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j;
  }

  function resolveWhen(t) {
    var A = window.ALLY_AGENDA;
    var base = A.TODAY;
    var parts = base.split('-');
    var aujourd = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));

    /* « le 14 septembre », « le 14 » */
    var avecMois = t.match(/\b(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/);
    if (avecMois) {
      var jour = Number(avecMois[1]);
      var mois = MOIS_NOMS.indexOf(avecMois[2]);
      var annee = aujourd.getFullYear();
      var vise = new Date(annee, mois, jour);
      /* Un mois déjà passé désigne l'année suivante : « le 3 janvier » dit en
         décembre ne veut pas dire il y a onze mois. */
      if (vise < aujourd) vise = new Date(annee + 1, mois, jour);
      return iso(vise);
    }

    var seul = t.match(/\ble\s+(\d{1,2})\b/);
    if (seul) {
      var n = Number(seul[1]);
      if (n >= 1 && n <= 31) {
        var ceMois = new Date(aujourd.getFullYear(), aujourd.getMonth(), n);
        if (ceMois < aujourd) ceMois = new Date(aujourd.getFullYear(), aujourd.getMonth() + 1, n);
        return iso(ceMois);
      }
    }

    /* « dans trois jours », « dans deux semaines » */
    var dans = t.match(/\bdans\s+(\d{1,2})\s+(jour|jours|semaine|semaines)\b/);
    if (dans) {
      var pas = Number(dans[1]) * (/semaine/.test(dans[2]) ? 7 : 1);
      var futur = new Date(aujourd.getTime());
      futur.setDate(futur.getDate() + pas);
      return iso(futur);
    }

    /* « la semaine prochaine » sans autre précision : le lundi suivant. */
    if (/semaine prochaine/.test(t) && !findDay(t)) {
      var lundi = new Date(aujourd.getTime());
      lundi.setDate(lundi.getDate() + ((8 - lundi.getDay()) % 7 || 7));
      return iso(lundi);
    }

    var jourDit = findDay(t);
    if (jourDit) {
      var resolu = A.resolveDate(jourDit, base);
      /* « lundi prochain » : la semaine d'après, pas le lundi qui vient. */
      if (/prochaine?\b/.test(t) && !/demain/.test(jourDit)) {
        var p2 = resolu.split('-');
        var d2 = new Date(Number(p2[0]), Number(p2[1]) - 1, Number(p2[2]));
        if ((d2 - aujourd) / 86400000 < 7) { d2.setDate(d2.getDate() + 7); return iso(d2); }
      }
      return resolu;
    }

    if (/aujourd hui|ce soir|cet apres midi|ce matin/.test(t)) return base;
    return null;
  }
  function findHalf(text) {
    if (hasAny(text, ['apres midi', 'apres-midi'])) return 'après-midi';
    if (text.indexOf('matin') !== -1) return 'matin';
    if (text.indexOf('soir') !== -1) return 'fin de journée';
    return null;
  }

  /* Score de recouvrement avec une entrée de la base de connaissances. */
  var STOP = ['le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'a', 'au',
    'aux', 'en', 'est', 'ce', 'que', 'qui', 'quoi', 'quel', 'quelle', 'quels',
    'quelles', 'pour', 'sur', 'dans', 'vous', 'votre', 'vos', 'mon', 'ma', 'mes',
    'je', 'tu', 'il', 'elle', 'ally', 'combien', 'comment', 'est ce', 'sont'];

  function keywords(text) {
    return norm(text).split(' ').filter(function (w) {
      return w.length > 2 && STOP.indexOf(w) === -1;
    });
  }

  /* Un appelant ne reprend jamais les mots exacts de la fiche : il demande
     « vous intervenez dans quel secteur » là où la base dit « zone
     d'intervention ». On élargit donc la question, pas la base. */
  var SYNONYMS = {
    secteur: ['zone', 'intervention', 'perimetre'],
    zone: ['secteur', 'intervention'],
    intervenez: ['intervention', 'zone', 'secteur'],
    intervenir: ['intervention', 'zone', 'secteur'],
    deplacez: ['intervention', 'zone', 'secteur'],
    tarif: ['prix', 'cout', 'honoraires'],
    tarifs: ['tarif', 'prix', 'cout', 'honoraires'],
    prix: ['tarif', 'cout'],
    coute: ['tarif', 'prix'],
    horaire: ['horaires', 'ouverture', 'ouvert'],
    horaires: ['horaire', 'ouverture', 'ouvert'],
    ouvert: ['horaires', 'ouverture'],
    ouvrez: ['horaires', 'ouverture'],
    delai: ['delais', 'attente'],
    delais: ['delai', 'attente'],
    garantie: ['garanties', 'decennale', 'assurance'],
    apporter: ['documents', 'document', 'piece'],
    papiers: ['documents', 'document', 'piece'],
    rembourse: ['vitale', 'mutuelle', 'secteur'],
    /* Vocabulaire de la fiche du cabinet : l'appelant demande « où me garer »,
       la fiche s'appelle « Stationnement ». */
    garer: ['parking', 'stationnement', 'place', 'voiture'],
    garez: ['parking', 'stationnement', 'place'],
    stationner: ['parking', 'stationnement', 'place'],
    parking: ['stationnement', 'garer', 'place'],
    adresse: ['rue', 'situe', 'trouve', 'venir'],
    venir: ['acces', 'adresse', 'metro', 'rue'],
    trouve: ['adresse', 'rue', 'situe'],
    situe: ['adresse', 'rue'],
    acces: ['venir', 'metro', 'etage', 'ascenseur'],
    payer: ['paiement', 'carte', 'cheque', 'virement'],
    paiement: ['payer', 'carte', 'cheque', 'virement'],
    reglement: ['paiement', 'payer', 'carte'],
    carte: ['paiement', 'payer'],
    rappelez: ['delai', 'rappel', 'reponse'],
    rappel: ['delai', 'reponse']
  };

  function expand(words) {
    var out = words.slice();
    words.forEach(function (word) {
      var extra = SYNONYMS[word];
      if (extra) extra.forEach(function (syn) {
        if (out.indexOf(syn) === -1) out.push(syn);
      });
    });
    return out;
  }

  function faqMatch(text, faq) {
    var asked = expand(keywords(text));
    if (!asked.length) return null;
    var best = null, bestScore = 0;

    faq.forEach(function (item) {
      var pool = keywords(item.q + ' ' + item.a);
      var score = 0;
      asked.forEach(function (word) {
        pool.forEach(function (candidate) {
          if (candidate === word) score += 2;
          else if (candidate.indexOf(word) === 0 || word.indexOf(candidate) === 0) score += 1;
        });
      });
      if (score > bestScore) { bestScore = score; best = item; }
    });

    return bestScore >= 2 ? best : null;
  }

  window.ALLY_BRAIN = {

    /* Suggestions affichées au pro, adaptées à son métier. */
    suggestions: function () {
      var store = window.ALLY_STORE;
      var p = store.profile();
      var D = store.data();
      var first = D.rdv[0];
      return [
        'Quel est mon prochain rendez-vous ?',
        'Quels sont mes créneaux libres cette semaine ?',
        first ? 'Déplace le rendez-vous de ' + first.time + ' à demain' : 'Bloque mon agenda vendredi après-midi',
        'Résume-moi la semaine',
        'Combien de brouillons attendent ma validation ?',
        D.faq[1] ? D.faq[1].q + ' ?' : 'Quels sont mes horaires ?',
        'Y a-t-il eu des urgences aujourd\'hui ?'
      ];
    },

    /* Renvoie { reply, detail, kind, sensitive, apply }.
       - kind : 'answer' (question) | 'action' (modification) | 'unknown'
       - sensitive : l'action mérite une confirmation orale
       - apply : fonction appelée si l'ordre est confirmé (peut être absente) */
    ask: function (input) {
      var store = window.ALLY_STORE;
      var S = store.state;
      var p = store.profile();
      var D = store.data();
      /* « dans trois jours », « à quatorze heures » : les nombres dits en
         toutes lettres deviennent des chiffres avant l'analyse. Écrit ou
         dicté, le moteur lit la même chose — c'est la même traduction qui sert
         à la reconnaissance vocale. */
      var t = norm(input);
      if (window.ALLY_SPEECH) t = window.ALLY_SPEECH.depuisLaVoix(t);

      if (!t) {
        return { kind: 'unknown', reply: 'Je n\'ai rien entendu. Vous pouvez répéter ?' };
      }

      /* ---------- Identité ---------- */
      if (hasAny(t, ['qui suis je', 'mon nom', 'je suis qui'])) {
        return {
          kind: 'answer',
          reply: 'Vous êtes ' + store.displayName() + ', ' + S.identity.org + '.',
          detail: 'Profil ' + p.name.toLowerCase()
        };
      }

      /* ---------- Urgences et appels ---------- */
      if (hasAny(t, ['urgence', 'urgent'])
          && !hasAny(t, ['transfere', 'transferer', 'bascule', 'renvoie'])) {
        var urgent = D.calls.filter(function (c) { return c.kind === 'urgent'; });
        if (!urgent.length) {
          return { kind: 'answer', reply: 'Aucune urgence aujourd\'hui.' };
        }
        return {
          kind: 'answer',
          reply: 'Oui : ' + urgent[0].caller + ' a appelé à ' + urgent[0].time
            + ' pour « ' + urgent[0].subject + ' ». Je vous l\'ai transféré immédiatement.',
          detail: urgent[0].transcript
        };
      }

      if (hasAny(t, ['qui a appele', 'appels', 'appel recu', 'appele aujourd hui'])) {
        var names = D.calls.map(function (c) { return c.caller; });
        return {
          kind: 'answer',
          reply: D.calls.length + ' appels aujourd\'hui : ' + names.join(', ') + '.',
          detail: D.calls.filter(function (c) { return c.kind === 'pending'; }).length
            + ' en attente de rappel'
        };
      }

      /* ---------- Email adressé à un rendez-vous de l'agenda ----------
         « Envoie un mail à mon rendez-vous de 15h, dis-lui qu'on décale la
         signature à vendredi. » Ally retrouve l'interlocuteur dans l'agenda,
         rédige, et envoie — sans demander de confirmation, par choix produit. */
      if (hasAny(t, ['envoie', 'envoyer', 'ecris', 'previens', 'previens'])
          && (parleDeRdv(t) || hasAnyLoose(t, ['client', 'patient']))) {
        var at = findTime(t);
        var target = at
          ? D.rdv.filter(function (r) { return r.time === at; })[0]
          : D.rdv[0];

        if (!target) {
          return {
            kind: 'answer',
            reply: at
              ? 'Je ne trouve aucun rendez-vous à ' + at.replace(':', 'h') + ' dans votre agenda.'
              : 'Je ne vois aucun rendez-vous auquel écrire.',
            detail: 'Précisez l\'heure, par exemple « mon rendez-vous de 15h ».'
          };
        }

        /* Le message dicté après « dis-lui que » devient le corps de l'email. */
        var raw = String(input);
        // L'apostrophe de « qu'on » saute souvent à la dictée : on la rend facultative.
        var m = raw.match(/(?:dis[- ]lui|dites[- ]lui|explique[- ]lui|pour lui dire)\s+(?:qu[e'’]?\s*)?(.+)$/i);
        var message = m ? m[1].replace(/[.\s]+$/, '') : null;

        var body = message
          ? 'Bonjour, ' + message + '. Je reste à votre disposition. Bien à vous, '
            + store.displayName() + '.'
          : 'Bonjour, je reviens vers vous au sujet de notre rendez-vous. Bien à vous, '
            + store.displayName() + '.';

        return {
          kind: 'action', sensitive: false,
          reply: 'C\'est envoyé à ' + target.client + '. Je lui ai écrit : « '
            + (message || 'un mot au sujet de votre rendez-vous') + ' ».',
          detail: 'Rendez-vous de ' + target.time + ' — ' + target.type,
          apply: function () {
            /* Dix secondes pour se rétracter : c'est le garde-fou du choix
               « aucune confirmation orale avant envoi ». L'email part, mais
               une erreur de transcription reste rattrapable. */
            store.sendDirect({
              subject: 'Message de ' + store.displayName(),
              to: target.client, body: body, category: 'Dicté à la voix'
            });
            store.log('Email vocal à ' + target.client, 'Envoi dans 10 s, annulable');
          },
          follow: ['Résume-moi ma journée', 'Déplace ce rendez-vous']
        };
      }

      /* ---------- Brouillons et emails ---------- */
      if (hasAny(t, ['brouillon', 'a valider', 'validation'])
          && !hasAny(t, ['envoie', 'envoyer', 'envoi'])) {
        var n = D.drafts.length;
        if (!n) return { kind: 'answer', reply: 'Aucun brouillon en attente.' };
        return {
          kind: 'answer',
          reply: n + ' brouillon' + (n > 1 ? 's attendent' : ' attend') + ' votre validation : '
            + D.drafts.map(function (d) { return d.subject; }).join(', ') + '.',
          detail: 'Onglet Conversations, filtre « À valider »'
        };
      }

      if (hasAny(t, ['envoie', 'envoyer', 'envoi']) && hasAny(t, ['mail', 'email', 'courriel', 'devis', 'compte rendu'])) {
        var blocked = S.rules.draft;
        if (blocked) {
          return {
            kind: 'action', sensitive: true,
            confirm: 'Je prépare cet email. Votre profil impose une validation avant envoi, je le laisse en brouillon — vous confirmez ?',
            reply: 'Le brouillon est prêt dans vos emails à valider. Votre profil '
              + p.name.toLowerCase() + ' interdit un envoi direct sans votre accord.',
            detail: 'Règle « aucun envoi sans validation » active'
          };
        }
        return {
          kind: 'action', sensitive: true,
          confirm: 'J\'envoie cet email maintenant, vous confirmez ?',
          reply: 'C\'est envoyé.',
          detail: 'Autonomie emails : ' + this.autonomyLabel(S.autonomy.emails)
        };
      }

      /* ---------- Création de rendez-vous ----------
         « Crée un rendez-vous avec M. Dupont vendredi à 10h ». Les verbes sont
         larges à dessein : personne ne dicte deux fois de la même façon. */
      var CREATE_VERBS = ['cree', 'creer', 'ajoute', 'rajoute', 'prends', 'prend',
        'note', 'noter', 'planifie', 'programme', 'reserve', 'fixe', 'cale',
        'inscris', 'mets', 'bloque moi', 'organise'];

      if (hasAnyLoose(t, CREATE_VERBS)
          && (parleDeRdv(t) || hasAnyLoose(t, ['visite', 'audience']))
          && !hasAny(t, ['deplace', 'decale', 'bouge', 'annule', 'supprime'])) {

        var nt = findTime(t);
        var nd = findDay(t);

        /* Le nom vient après « avec ». On le reprend tel qu'écrit, sans
           normalisation, pour garder la casse et les accents. */
        var who = null;
        var withMatch = String(input).match(
          /\bavec\s+(.+?)(?:\s+(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain|apr[eè]s[- ]demain|[àa]\s*\d)|[,;]|$)/i);
        if (withMatch) who = withMatch[1].replace(/[\s.,;]+$/, '').trim();

        if (!nt) {
          return {
            kind: 'answer',
            reply: 'À quelle heure ? Dites-moi par exemple « crée un rendez-vous '
              + (who ? 'avec ' + who + ' ' : '') + (nd || 'vendredi') + ' à 10h ».',
            detail: 'Il me faut au moins une heure pour poser le créneau.'
          };
        }

        var A = window.ALLY_AGENDA;
        /* « le 14 septembre », « dans trois jours », « lundi prochain » : tout
           cela retombait sur aujourd'hui, et le rendez-vous se posait au
           mauvais jour sans que rien ne le signale. */
        var iso = resolveWhen(t) || A.TODAY;
        var label = A.shortLabel(iso);

        var client = who || 'Nouveau ' + p.clientWord;
        var kindLabel = hasAny(t, ['consultation']) ? 'Consultation'
          : hasAny(t, ['visite']) ? 'Visite'
          : hasAny(t, ['audience']) ? 'Audience'
          : 'Rendez-vous';

        return {
          kind: 'action', sensitive: false,
          reply: 'C\'est posé : ' + client + ', ' + quandDit(iso)
            + ' à ' + nt.replace(':', 'h') + '.',
          detail: kindLabel + ' — ajouté à votre agenda',
          apply: function () {
            /* Ligne connectée : le rendez-vous part au serveur, sinon la
               synchronisation suivante l'effacerait sans explication. On
               l'affiche tout de suite quand même — la réponse d'Ally vient
               d'être prononcée, l'agenda doit suivre dans la seconde. */
            D.rdv.push({
              id: Date.now(), date: iso, client: client,
              type: kindLabel, time: nt
            });
            A.select(iso);
            store.log('Création de rendez-vous — ' + client,
              label + ' ' + nt.replace(':', 'h'));

            if (window.ALLY_SYNC && window.ALLY_SYNC.connected()) {
              window.ALLY_SYNC.createRdv({
                date: iso, time: nt, client: client, type: kindLabel
              }).then(function (result) {
                if (result && !result.ok) window.ALLY_UI.toast(result.error);
                window.ALLY_SYNC.pull(window.ALLY_DASHBOARD_REFRESH);
              });
            }
          },
          follow: ['Quel est mon prochain rendez-vous ?', 'Résume-moi ma journée']
        };
      }

      /* ---------- Agenda : consultation ---------- */
      if (hasAny(t, ['prochain rendez vous', 'prochain rdv', 'prochain rendez'])) {
        var A0 = window.ALLY_AGENDA;
        var next = D.rdv.filter(function (r) { return r.date >= A0.TODAY; })
          .sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; })[0];
        if (!next) return { kind: 'answer', reply: 'Aucun rendez-vous à venir.' };
        return {
          kind: 'answer',
          reply: 'Votre prochain rendez-vous : ' + next.client + ' à ' + next.time
            + ', ' + A0.longLabel(next.date) + ' — ' + next.type + '.'
        };
      }

      if ((parleDeRdv(t) || hasAnyLoose(t, ['planning']))
          && hasAny(t, ['combien', 'quoi', 'journee', 'aujourd hui', 'demain', 'programme', 'ai je'])
          && !hasAny(t, ['deplace', 'decale', 'bouge', 'bloque', 'annule'])
          && !hasAny(t, CREATE_VERBS)) {
        /* « et demain ? », « mes rendez-vous lundi » : le jour demandé était
           ignoré, et Ally répondait toujours pour aujourd'hui — en ayant l'air
           d'avoir compris, ce qui est pire que de ne pas répondre. */
        var A4 = window.ALLY_AGENDA;
        var quand = resolveWhen(t) || A4.TODAY;
        var liste = A4.rdvOn(quand);
        var libelleJour = quandDit(quand);

        if (!liste.length) {
          return {
            kind: 'answer',
            reply: 'Aucun rendez-vous ' + libelleJour + '.',
            detail: D.rdv.length ? D.rdv.length + ' au total dans l\'agenda' : null
          };
        }
        return {
          kind: 'answer',
          reply: liste.length + ' rendez-vous ' + libelleJour + ' : '
            + liste.map(function (r) { return r.client + ' à ' + r.time; }).join(', ') + '.',
          detail: D.rdv.length - liste.length + ' autres dans l\'agenda'
        };
      }

      /* ---------- Agenda : modification ---------- */
      if (hasAny(t, ['deplace', 'decale', 'bouge', 'reporte'])) {
        var A2 = window.ALLY_AGENDA;
        var time = findTime(t);
        var day = findDay(t);
        var target = time
          ? D.rdv.filter(function (r) { return r.time === time; })[0]
          : D.rdv.filter(function (r) { return r.date >= A2.TODAY; })[0];

        if (!target) {
          return { kind: 'answer', reply: 'Je ne trouve pas ce rendez-vous dans votre agenda.' };
        }

        var newDate = resolveWhen(t) || target.date;
        var who = target.client;

        return {
          kind: 'action', sensitive: true,
          confirm: 'Vous voulez bien que je déplace le rendez-vous de ' + who
            + ' au ' + A2.longLabel(newDate) + ' ?',
          reply: 'C\'est fait, le rendez-vous de ' + who + ' passe au '
            + A2.longLabel(newDate) + ' à ' + target.time.replace(':', 'h')
            + '. Je préviens ' + (p.clientWord === 'patient' ? 'le patient' : 'le client') + '.',
          detail: 'Modification visible dans le calendrier',
          apply: function () {
            var ancienne = target.date;
            target.date = newDate;
            A2.select(newDate);
            store.log('Déplacement de ' + who, 'Reporté au ' + A2.longLabel(newDate));

            if (window.ALLY_SYNC && window.ALLY_SYNC.isReal(target.id)) {
              window.ALLY_SYNC.moveRdv(target.id, newDate, target.time)
                .then(function (result) {
                  if (result && !result.ok) {
                    target.date = ancienne;
                    window.ALLY_UI.toast(result.error);
                  }
                  window.ALLY_SYNC.pull(window.ALLY_DASHBOARD_REFRESH);
                });
            }
          }
        };
      }

      if (hasAny(t, ['bloque', 'bloquer', 'indisponible', 'reserve moi'])) {
        var A3 = window.ALLY_AGENDA;
        var iso3 = resolveWhen(t) || A3.TODAY;
        var half = findHalf(t) || 'toute la journée';
        return {
          kind: 'action', sensitive: false,
          reply: A3.longLabel(iso3) + ', ' + half + ' : c\'est bloqué. '
            + 'Aucun rendez-vous ne sera proposé sur ce créneau.',
          detail: 'Visible en grisé dans le calendrier',
          apply: function () {
            D.blocked.push({ id: Date.now(), date: iso3, half: half });
            A3.select(iso3);
            store.log('Blocage de créneau', A3.longLabel(iso3) + ' — ' + half);
          }
        };
      }

      if (hasAnyLoose(t, ['annule', 'annuler', 'supprime']) && parleDeRdv(t)) {
        return {
          kind: 'action', sensitive: true,
          confirm: 'J\'annule ce rendez-vous et je préviens l\'intéressé, vous confirmez ?',
          reply: 'Le rendez-vous est annulé, la personne est prévenue.',
          detail: 'Créneau libéré'
        };
      }

      /* ---------- Règles et configuration ---------- */
      if (hasAny(t, ['transfere', 'transferer', 'bascule', 'renvoie']) && hasAny(t, ['urgence', 'urgent', 'portable'])) {
        return {
          kind: 'action', sensitive: true,
          confirm: 'Je modifie votre règle de transfert des urgences, vous confirmez ?',
          reply: 'Règle mise à jour : les urgences arrivent désormais directement sur votre portable'
            + (S.identity.phone ? ', au ' + S.identity.phone : '') + '.',
          detail: 'Onglet Ally → Contacts prioritaires',
          apply: function () { S.rules.transfer = true; store.save(); }
        };
      }

      if (hasAny(t, ['mode brouillon', 'valider avant', 'sans validation', 'autonomie'])) {
        return {
          kind: 'answer',
          reply: 'Aujourd\'hui : appels ' + this.autonomyLabel(S.autonomy.calls).toLowerCase()
            + ', emails ' + this.autonomyLabel(S.autonomy.emails).toLowerCase()
            + ', agenda ' + this.autonomyLabel(S.autonomy.agenda).toLowerCase() + '.',
          detail: p.secret ? 'Profil à secret professionnel : validation imposée sur les emails' : null
        };
      }

      if (hasAny(t, ['horaire', 'ouvert', 'ouverture', 'ferme', 'fermeture'])
          && hasAny(t, ['mes', 'je', 'mon', 'suis'])) {
        var open = S.hours.filter(function (h) { return h.on; });
        return {
          kind: 'answer',
          reply: 'Vous êtes ouvert ' + open.map(function (h) {
            return h.label.toLowerCase() + ' ' + h.from + '-' + h.to;
          }).join(', ') + '.',
          detail: S.closures ? 'Fermetures : ' + S.closures : null
        };
      }

      /* ---------- Quand suis-je libre ? ----------

         La question qu'on pose vraiment à une secrétaire, et la seule à
         laquelle Ally ne savait pas répondre : elle savait lister les
         rendez-vous, pas trouver un trou entre deux. On croise les horaires
         déclarés, les rendez-vous posés et la durée habituelle d'un
         rendez-vous — les trois sont déjà là, il suffisait de les regarder
         ensemble. */
      if (hasAnyLoose(t, ['libre', 'disponible', 'disponibilite', 'dispo'])
          || (parleDeRdv(t) && hasAnyLoose(t, ['trou', 'place', 'prochain creneau']))) {
        var A5 = window.ALLY_AGENDA;
        var duree = Number(S.survey.rdvDuration || 45);
        var depart = resolveWhen(t) || A5.TODAY;
        var trouves = [];

        for (var jour = 0; jour < 14 && trouves.length < 3; jour++) {
          var date = jour === 0 ? depart : decale(depart, jour);
          var libres = creneauxLibres(date, duree);
          if (libres.length) {
            trouves.push({ date: date, heures: libres.slice(0, 3) });
          }
          /* Un jour demandé explicitement ne s'étend pas aux suivants. */
          if (resolveWhen(t) && jour === 0 && !hasAny(t, ['semaine', 'prochain'])) break;
        }

        if (!trouves.length) {
          return {
            kind: 'answer',
            reply: 'Rien de libre dans vos horaires sur la période demandée.',
            detail: 'Vos horaires sont réglés dans Ally → Disponibilités.'
          };
        }

        var dit = trouves.map(function (j) {
          return A5.shortLabel(j.date) + ' à ' + j.heures.join(', ');
        }).join(' ; ');

        return {
          kind: 'answer',
          reply: 'Créneaux libres de ' + duree + ' minutes : ' + dit + '.',
          detail: 'Calculé sur vos horaires, moins les rendez-vous déjà posés',
          follow: ['Crée un rendez-vous ' + A5.shortLabel(trouves[0].date)
            + ' à ' + trouves[0].heures[0]]
        };
      }

      /* ---------- Quand est mon rendez-vous avec X ? ---------- */
      if (parleDeRdv(t) && hasAnyLoose(t, ['avec', 'quand'])
          && !hasAny(t, CREATE_VERBS)
          && !hasAny(t, ['deplace', 'decale', 'bouge', 'annule', 'libre'])) {
        var cherche = nomCherche(input);
        if (cherche) {
          var trouve = D.rdv.filter(function (r) {
            return norm(r.client).indexOf(cherche) !== -1;
          }).sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; })[0];

          if (trouve) {
            return {
              kind: 'answer',
              reply: 'Rendez-vous avec ' + trouve.client + ' le '
                + window.ALLY_AGENDA.longLabel(trouve.date) + ' à ' + trouve.time + '.',
              detail: trouve.type,
              follow: ['Déplace le rendez-vous de ' + trouve.time,
                'Annule le rendez-vous de ' + trouve.time]
            };
          }
          return {
            kind: 'answer',
            reply: 'Aucun rendez-vous à ce nom dans l\'agenda.',
            detail: D.rdv.length + ' rendez-vous enregistrés au total'
          };
        }
      }

      /* ---------- Résumé de la semaine ---------- */
      if (hasAnyLoose(t, ['resume', 'resumer', 'bilan', 'recapitulatif', 'ou en suis je'])
          && hasAnyLoose(t, ['semaine', 'mois', 'journee', 'jour'])) {
        var surMois = hasAny(t, ['mois']);
        var usage = store.usage();
        var rdvAVenir = D.rdv.filter(function (r) { return r.date >= window.ALLY_AGENDA.TODAY; });
        var urgences = D.calls.filter(function (c) { return c.kind === 'urgent'; }).length;

        return {
          kind: 'answer',
          reply: (surMois ? 'Ce mois-ci' : 'Cette semaine') + ' : '
            + usage.calls.used + ' appel' + (usage.calls.used > 1 ? 's' : '') + ' reçu'
            + (usage.calls.used > 1 ? 's' : '') + ', '
            + usage.emails.used + ' email' + (usage.emails.used > 1 ? 's' : '') + ' parti'
            + (usage.emails.used > 1 ? 's' : '') + ', '
            + rdvAVenir.length + ' rendez-vous à venir'
            + (urgences ? ', ' + urgences + ' urgence' + (urgences > 1 ? 's' : '') : '')
            + '.',
          detail: D.drafts.length
            ? D.drafts.length + ' brouillon(s) attendent encore votre validation'
            : 'Rien ne vous attend.',
          follow: ['Quels sont mes créneaux libres ?', 'Résume-moi ma journée']
        };
      }

      /* ---------- Rappeler quelqu'un ---------- */
      if (hasAnyLoose(t, ['rappelle', 'rappeler', 'recontacte', 'recontacter'])
          && !hasAny(t, ['rappelle moi', 'rappel moi'])) {
        var qui = nomCherche(input);
        var appel = qui
          ? D.calls.filter(function (c) { return norm(c.caller).indexOf(qui) !== -1; })[0]
          : D.calls.filter(function (c) { return c.kind === 'pending'; })[0];

        if (!appel) {
          return {
            kind: 'answer',
            reply: qui
              ? 'Je ne trouve pas d\'appel à ce nom aujourd\'hui.'
              : 'Personne n\'attend de rappel pour l\'instant.',
            detail: D.calls.length + ' appel(s) dans la journée'
          };
        }

        return {
          kind: 'action', sensitive: false,
          reply: appel.caller + ' attend un rappel — appel de ' + appel.time
            + ', ' + (appel.subject || 'sans motif noté') + '. '
            + 'Je note le rappel en tête de vos actions.',
          detail: 'Le numéro est dans la fiche de l\'appel',
          apply: function () {
            store.log('Rappel à programmer — ' + appel.caller, appel.subject || 'Rappel demandé');
          },
          follow: ['Envoie-lui un email', 'Qui a appelé aujourd\'hui ?']
        };
      }

      /* ---------- Je suis en retard ----------

         Dit à voix haute en voiture, c'est le cas d'usage le plus concret du
         produit. Il tombait jusqu'ici dans la base de connaissances et
         recevait le tarif d'une consultation en réponse. */
      if (hasAnyLoose(t, ['en retard', 'retarde', 'bloque dans', 'embouteillage'])
          && !parleDeRdv(t)) {
        var minutes = (t.match(/(\d{1,3})\s*(?:min|minutes)/) || [])[1];
        var suivant = window.ALLY_AGENDA.rdvOn(window.ALLY_AGENDA.TODAY)
          .filter(function (r) { return r.time >= heureCourante(); })[0];

        if (!suivant) {
          return {
            kind: 'answer',
            reply: 'Rien dans l\'agenda d\'ici la fin de la journée : personne ne vous attend.',
            detail: 'Je préviens quand même si un rendez-vous arrive.'
          };
        }
        return {
          kind: 'action', sensitive: true,
          confirm: 'Je préviens ' + suivant.client + ' que vous aurez '
            + (minutes ? minutes + ' minutes' : 'un peu') + ' de retard ?',
          reply: suivant.client + ' est prévenu' + (minutes ? ' de vos ' + minutes + ' minutes' : '')
            + ' de retard. Le rendez-vous de ' + suivant.time + ' est maintenu.',
          detail: 'Email préparé et envoyé dans les dix secondes',
          apply: function () {
            store.log('Retard signalé à ' + suivant.client,
              (minutes ? minutes + ' min' : 'Retard') + ' — rendez-vous de ' + suivant.time);
          }
        };
      }

      /* ---------- Base de connaissances du cabinet ---------- */
      var found = faqMatch(input, store.knowledge());
      if (found) {
        return {
          kind: 'answer',
          reply: found.a,
          detail: 'Base de connaissances → ' + found.q
        };
      }

      /* ---------- Repli ----------

         Un « je n'ai pas compris » identique pour tout ne dit rien de ce qu'il
         fallait dire. On regarde donc de quoi la phrase parlait pour proposer
         la compétence la plus proche : c'est la différence entre un mur et une
         indication. */
      var pistes = [
        { mots: ['agenda', 'rendez', 'rdv', 'creneau', 'planning', 'libre', 'dispo'],
          dit: 'Pour l\'agenda, dites « mes rendez-vous demain », « quels créneaux libres ? » '
            + 'ou « crée un rendez-vous jeudi à 10h ».' },
        { mots: ['mail', 'email', 'courriel', 'ecrire', 'repondre', 'envoyer', 'envoie'],
          dit: 'Pour le courrier, dites « envoie un email à Mme Aubert pour confirmer » '
            + 'ou « combien de brouillons attendent ? ».' },
        { mots: ['appel', 'telephone', 'appele', 'rappel', 'sonne'],
          dit: 'Pour les appels, dites « qui a appelé aujourd\'hui ? », « y a-t-il eu des '
            + 'urgences ? » ou « rappelle M. Untel ».' },
        { mots: ['tarif', 'prix', 'honoraire', 'facture', 'paiement'],
          dit: 'Les tarifs se règlent dans la fiche du cabinet — Ally les donne alors '
            + 'toute seule aux appelants qui posent la question.' },
        { mots: ['horaire', 'ouvert', 'ferme', 'vacances', 'absence'],
          dit: 'Pour vos horaires, dites « quels sont mes horaires ? » ou « bloque '
            + 'vendredi après-midi ».' }
      ];

      var proche = null;
      pistes.forEach(function (piste) {
        if (!proche && hasAnyLoose(t, piste.mots)) proche = piste;
      });

      if (proche) {
        return {
          kind: 'unknown',
          reply: 'Je n\'ai pas bien saisi la demande. ' + proche.dit,
          detail: 'Reformulez, ou dictez-la : je comprends aussi « à quatorze heures trente ».'
        };
      }

      return {
        kind: 'unknown',
        reply: 'Je n\'ai pas compris cette demande. Je sais consulter et modifier votre '
          + 'agenda, trouver un créneau libre, préparer un email, dire qui a appelé, '
          + 'et répondre à partir de la fiche du cabinet.',
        detail: 'Essayez : « ' + this.suggestions()[0] + ' »'
      };
    },

    autonomyLabel: function (v) {
      return v < 34 ? 'Toujours valider' : v < 67 ? 'Semi-autonome' : 'IA autonome';
    },

    /* Utilisé par la simulation d'appel : la réponse qu'Ally donnerait à un
       appelant, en respectant les règles de transfert. */
    answerCaller: function (input) {
      var store = window.ALLY_STORE;
      var p = store.profile();
      var D = store.data();
      var t = norm(input);

      if (hasAny(t, urgencyWords())) {
        /* La règle « transférer les urgences » a longtemps été décorative : la
           simulation transférait quoi qu'il arrive. Désactivée, Ally reconnaît
           toujours l'urgence, mais elle la signale au lieu de faire sonner. */
        if (!store.state.rules.transfer) {
          return {
            kind: 'note',
            reply: 'Je comprends que c\'est urgent. ' + store.displayName()
              + ' n\'est pas joignable dans l\'immédiat : je note votre demande '
              + 'en priorité et je la lui signale tout de suite.'
          };
        }
        return {
          kind: 'transfer',
          reply: 'Je comprends qu\'il s\'agit d\'une urgence. Je vous mets en relation '
            + 'immédiatement avec ' + store.displayName() + ', ne quittez pas.'
        };
      }

      var known = faqMatch(input, store.knowledge());

      /* Une question de renseignement passe avant la prise de rendez-vous :
         « vos tarifs pour une première consultation ? » demande un prix, pas
         un créneau, alors que le mot « consultation » y figure. */
      var isQuestion = hasAny(t, ['tarif', 'prix', 'coute', 'combien', 'horaire',
        'ouvert', 'ferme', 'secteur', 'zone', 'delai', 'garantie', 'document',
        'quel', 'quels', 'quelle', 'quelles']);
      if (known && isQuestion) return { kind: 'answer', reply: known.a };

      var wantsBooking = parleDeRdv(t) || hasAnyLoose(t, ['disponibilite', 'devis'])
        || (hasAny(t, ['consultation', 'accompagnement', 'intervention'])
            && hasAny(t, ['souhaite', 'voudrais', 'cherche', 'prendre', 'avoir', 'possible']));

      if (wantsBooking) {
        var A4 = window.ALLY_AGENDA;
        var slot = D.rdv.filter(function (r) { return r.date > A4.TODAY; })[0];
        return {
          kind: 'booking',
          reply: 'Je peux vous proposer un créneau'
            + (slot ? ' ' + A4.longLabel(slot.date) + ' à ' + slot.time : ' cette semaine')
            + '. Cela vous convient-il ?'
        };
      }

      if (known) return { kind: 'answer', reply: known.a };

      return {
        kind: 'note',
        reply: 'Je note votre demande et je la transmets à ' + store.displayName()
          + ', qui vous rappellera. Puis-je avoir votre nom et votre numéro ?'
      };
    }
  };
})();
