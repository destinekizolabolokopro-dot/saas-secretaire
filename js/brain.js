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

    (store.profile().urgencies || []).forEach(function (item) {
      if (chosen.motifs.indexOf(item.label) < 0) return;
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
    if (text.indexOf('demain') !== -1) return 'demain';
    if (text.indexOf('apres demain') !== -1) return 'après-demain';
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
    rembourse: ['vitale', 'mutuelle', 'secteur']
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
        first ? 'Déplace le rendez-vous de ' + first.time + ' à demain' : 'Bloque mon agenda vendredi après-midi',
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
      var t = norm(input);

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
          && hasAny(t, ['rendez vous', 'rdv', 'client', 'patient'])) {
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
            D.sent.unshift({
              id: Date.now(),
              subject: 'Message de ' + store.displayName(),
              to: target.client, time: 'À l\'instant', body: body
            });
            store.log('Email vocal à ' + target.client, 'Envoyé sans relecture');
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

      if (hasAny(t, CREATE_VERBS)
          && hasAny(t, ['rendez vous', 'rdv', 'consultation', 'creneau', 'visite', 'audience'])
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
        var iso = A.resolveDate(nd, A.TODAY);
        var label = A.shortLabel(iso);

        var client = who || 'Nouveau ' + p.clientWord;
        var kindLabel = hasAny(t, ['consultation']) ? 'Consultation'
          : hasAny(t, ['visite']) ? 'Visite'
          : hasAny(t, ['audience']) ? 'Audience'
          : 'Rendez-vous';

        return {
          kind: 'action', sensitive: false,
          reply: 'C\'est posé : ' + client + ', ' + label.toLowerCase().replace('.', '')
            + ' à ' + nt.replace(':', 'h') + '.',
          detail: kindLabel + ' — ajouté à votre agenda',
          apply: function () {
            D.rdv.push({
              id: Date.now(), date: iso, client: client,
              type: kindLabel, time: nt
            });
            A.select(iso);
            store.log('Création de rendez-vous — ' + client,
              label + ' ' + nt.replace(':', 'h'));
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

      if (hasAny(t, ['agenda', 'rendez vous', 'rdv', 'planning'])
          && hasAny(t, ['combien', 'quoi', 'journee', 'aujourd hui', 'demain', 'programme', 'ai je'])
          && !hasAny(t, ['deplace', 'decale', 'bouge', 'bloque', 'annule'])
          && !hasAny(t, CREATE_VERBS)) {
        var today = window.ALLY_AGENDA.rdvOn(window.ALLY_AGENDA.TODAY);
        return {
          kind: 'answer',
          reply: today.length + ' rendez-vous aujourd\'hui : '
            + today.map(function (r) { return r.client + ' à ' + r.time; }).join(', ') + '.',
          detail: D.rdv.length - today.length + ' autres cette semaine'
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

        var newDate = day ? A2.resolveDate(day, A2.TODAY) : target.date;
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
            target.date = newDate;
            A2.select(newDate);
            store.log('Déplacement de ' + who, 'Reporté au ' + A2.longLabel(newDate));
          }
        };
      }

      if (hasAny(t, ['bloque', 'bloquer', 'indisponible', 'reserve moi'])) {
        var A3 = window.ALLY_AGENDA;
        var d = findDay(t);
        var iso3 = A3.resolveDate(d, A3.TODAY);
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

      if (hasAny(t, ['annule']) && hasAny(t, ['rendez vous', 'rdv', 'consultation'])) {
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

      /* ---------- Base de connaissances du cabinet ---------- */
      var found = faqMatch(input, D.faq);
      if (found) {
        return {
          kind: 'answer',
          reply: found.a,
          detail: 'Base de connaissances → ' + found.q
        };
      }

      /* ---------- Repli ---------- */
      return {
        kind: 'unknown',
        reply: 'Je n\'ai pas compris cette demande. Je sais consulter votre agenda, '
          + 'déplacer ou bloquer un rendez-vous, préparer un email, et répondre à partir '
          + 'de la base de connaissances du cabinet.',
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

      var known = faqMatch(input, D.faq);

      /* Une question de renseignement passe avant la prise de rendez-vous :
         « vos tarifs pour une première consultation ? » demande un prix, pas
         un créneau, alors que le mot « consultation » y figure. */
      var isQuestion = hasAny(t, ['tarif', 'prix', 'coute', 'combien', 'horaire',
        'ouvert', 'ferme', 'secteur', 'zone', 'delai', 'garantie', 'document',
        'quel', 'quels', 'quelle', 'quelles']);
      if (known && isQuestion) return { kind: 'answer', reply: known.a };

      var wantsBooking = hasAny(t, ['rendez vous', 'rdv', 'creneau', 'disponibilite', 'devis'])
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
