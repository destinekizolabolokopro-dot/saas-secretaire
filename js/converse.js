/* Ally — couche conversationnelle.
   Le moteur d'intentions répond juste, mais sèchement. Cette couche lui donne
   une tenue de conversation : elle se souvient du sujet en cours, comprend les
   relances (« et demain ? », « annule-le »), varie ses formulations et propose
   toujours la suite logique — comme un assistant qui suit le fil plutôt qu'un
   répondeur qui traite des requêtes isolées. */
(function () {
  'use strict';

  /* Mémoire courte : de quoi parle-t-on, et qu'a-t-on proposé ensuite. */
  var ctx = { intent: null, entity: null, entityType: null, lastReply: null, turns: 0 };

  function norm(text) {
    return String(text).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/['’]/g, ' ').replace(/[^a-z0-9\s:]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function has(t, words) { return words.some(function (w) { return t.indexOf(w) !== -1; }); }

  /* Varie l'ouverture sans jamais tomber dans le bavardage. */
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  var ACKS = ['', '', 'Alors, ', 'Voyons. ', 'Bien sûr. '];

  window.ALLY_CONVERSE = {

    reset: function () {
      ctx = { intent: null, entity: null, entityType: null, lastReply: null, turns: 0 };
    },

    context: function () { return ctx; },

    /* Point d'entrée unique du chat et de la voix. */
    respond: function (input) {
      var store = window.ALLY_STORE;
      var brain = window.ALLY_BRAIN;
      var D = store.data();
      var S = store.state;
      var t = norm(input);
      ctx.turns += 1;

      /* ---------- Politesse et fil de conversation ---------- */
      if (has(t, ['bonjour', 'salut', 'bonsoir', 'coucou']) && t.length < 24) {
        var hour = new Date().getHours();
        return this.wrap({
          kind: 'answer',
          reply: (hour < 18 ? 'Bonjour ' : 'Bonsoir ') + store.displayName() + '. '
            + this.brief(),
          follow: brain.suggestions().slice(0, 3)
        });
      }

      if (has(t, ['merci', 'parfait', 'super', 'nickel', 'tres bien']) && t.length < 26) {
        return this.wrap({
          kind: 'answer',
          reply: pick(['Avec plaisir.', 'Je vous en prie.', 'À votre service.'])
            + ' Autre chose ?',
          follow: brain.suggestions().slice(0, 2)
        });
      }

      if (has(t, ['que sais tu faire', 'que peux tu faire', 'tu sais faire quoi',
                  'aide moi', 'comment ca marche', 'tes fonctions'])) {
        return this.wrap({
          kind: 'answer',
          reply: 'Je gère trois choses pour vous. Vos appels : je décroche, je qualifie la '
            + 'demande et je transfère si c\'est urgent. Vos emails : je prépare les réponses, '
            + 'vous validez. Votre agenda : je pose, je déplace et j\'annule dans vos créneaux. '
            + 'Vous pouvez aussi me demander ce qui s\'est passé dans la journée.',
          detail: 'Dites-le simplement, comme à une assistante.',
          follow: ['Résume-moi ma journée', 'Quel est mon prochain rendez-vous ?',
                   'Y a-t-il eu des urgences ?']
        });
      }

      /* Résumé de la journée : ce qu'un pro demande en arrivant. */
      if (has(t, ['resume', 'recapitule', 'ma journee', 'quoi de neuf', 'du nouveau',
                  'ou en est on', 'fais le point'])) {
        return this.wrap({
          kind: 'answer',
          reply: this.brief(),
          detail: 'Mardi 28 juillet 2026',
          follow: this.briefFollow()
        });
      }

      /* ---------- Relances sur le sujet en cours ---------- */
      if (ctx.entity) {
        // « annule-le », « annule ce rendez-vous »
        if (has(t, ['annule', 'supprime', 'enleve']) && t.length < 40) {
          if (ctx.entityType === 'rdv') {
            var r = ctx.entity;
            return this.wrap({
              kind: 'action', sensitive: true,
              confirm: 'J\'annule le rendez-vous de ' + r.client + ' à ' + r.time
                + ' et je le préviens, vous confirmez ?',
              reply: 'C\'est annulé. J\'ai prévenu ' + r.client + ', le créneau est libéré.',
              detail: 'Vous pouvez toujours le reproposer depuis l\'agenda.',
              apply: function () {
                D.rdv = D.rdv.filter(function (x) { return x.id !== r.id; });
                store.log('Annulation de ' + r.client, 'Créneau libéré');
              },
              follow: ['Qui reste-t-il aujourd\'hui ?', 'Bloque ce créneau']
            });
          }
        }

        // « et demain ? », « et jeudi ? » — on rejoue l'intention précédente
        if (/^(et|puis|ensuite)\b/.test(t) || t.length < 16) {
          if (ctx.intent === 'agenda') {
            var day = has(t, ['demain']) ? 'demain' : null;
            var list = day
              ? D.rdv.filter(function (x) { return x.day !== 'Auj.'; }).slice(0, 2)
              : D.rdv.filter(function (x) { return x.day === 'Auj.'; });
            return this.wrap({
              kind: 'answer',
              reply: list.length
                ? (day ? 'Ensuite : ' : 'Aujourd\'hui : ') + list.map(function (x) {
                    return x.client + ' à ' + x.time + (day ? ' ' + x.day.toLowerCase() : '');
                  }).join(', ') + '.'
                : 'Rien de prévu sur cette période.',
              follow: ['Bloque mon agenda vendredi après-midi', 'Résume-moi ma journée']
            });
          }
        }
      }

      /* ---------- Sinon, le moteur d'intentions fait le travail ---------- */
      var result = brain.ask(input);

      // On mémorise le sujet pour les relances.
      if (/rendez|rdv|deplace|decale/.test(t)) {
        ctx.intent = 'agenda';
        ctx.entityType = 'rdv';
        ctx.entity = D.rdv[0] || null;
      } else if (/brouillon|mail|email/.test(t)) {
        ctx.intent = 'emails'; ctx.entityType = 'mail'; ctx.entity = D.drafts[0] || null;
      } else if (/appel|urgence/.test(t)) {
        ctx.intent = 'calls'; ctx.entityType = 'call'; ctx.entity = D.calls[0] || null;
      }

      /* On enrichit la réponse brute : accroche variée et suite proposée. */
      if (result.kind === 'answer' && ctx.turns > 1 && Math.random() < 0.4) {
        result.reply = pick(ACKS) + result.reply.charAt(0).toLowerCase() + result.reply.slice(1);
        result.reply = result.reply.charAt(0).toUpperCase() + result.reply.slice(1);
      }

      if (!result.follow) result.follow = this.followFor(result, ctx);
      return this.wrap(result);
    },

    /* Le point du jour, en une phrase utile. */
    brief: function () {
      var store = window.ALLY_STORE;
      var D = store.data();
      var today = D.rdv.filter(function (r) { return r.day === 'Auj.'; });
      var urgent = D.calls.filter(function (c) { return c.kind === 'urgent'; });
      var bits = [];

      bits.push(D.calls.length + (D.calls.length > 1 ? ' appels reçus' : ' appel reçu'));
      if (today.length) {
        bits.push(today.length + (today.length > 1 ? ' rendez-vous' : ' rendez-vous')
          + ', le prochain à ' + today[0].time + ' avec ' + today[0].client);
      } else {
        bits.push('aucun rendez-vous');
      }
      if (D.drafts.length) {
        bits.push(D.drafts.length + ' email' + (D.drafts.length > 1 ? 's' : '')
          + ' à valider');
      }

      var line = bits.join(', ') + '.';
      if (urgent.length) {
        line += ' À signaler : ' + urgent[0].caller + ' a appelé pour « '
          + urgent[0].subject + ' », je vous l\'ai transféré.';
      }
      return line;
    },

    briefFollow: function () {
      var D = window.ALLY_STORE.data();
      var out = [];
      if (D.drafts.length) out.push('Montre-moi les brouillons');
      if (D.rdv.length) out.push('Quel est mon prochain rendez-vous ?');
      out.push('Bloque mon agenda vendredi après-midi');
      return out.slice(0, 3);
    },

    /* Suite logique proposée après une réponse — le réflexe d'un assistant. */
    followFor: function (result, context) {
      if (result.kind === 'unknown') {
        return window.ALLY_BRAIN.suggestions().slice(0, 3);
      }
      if (context.intent === 'agenda') {
        return ['Et demain ?', 'Annule-le', 'Bloque mon agenda vendredi après-midi'];
      }
      if (context.intent === 'emails') {
        return ['Montre-moi les brouillons', 'Résume-moi ma journée'];
      }
      if (context.intent === 'calls') {
        return ['Qui a appelé aujourd\'hui ?', 'Rappelle-le pour moi'];
      }
      return ['Résume-moi ma journée', 'Quel est mon prochain rendez-vous ?'];
    },

    wrap: function (result) {
      ctx.lastReply = result.reply;
      if (!result.follow) result.follow = [];
      return result;
    }
  };
})();
