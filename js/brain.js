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

  /* Les verbes qui modifient l'agenda. Une seule liste, parce qu'il y en avait
     cinq, écrites à la main à cinq endroits, et qu'elles avaient divergé :
     « reporte » manquait dans trois d'entre elles. « Reporte mon prochain
     rendez-vous à demain 11h » était donc capté par l'intention qui *annonce*
     le prochain rendez-vous, et Ally répondait poliment sans rien déplacer.

     La règle est simple et vaut partout : un ordre de modification ne doit
     jamais être servi par une intention de lecture. */
  var MODIF_VERBS = ['deplace', 'decale', 'bouge', 'reporte', 'reporter',
    'annule', 'annuler', 'supprime', 'supprimer'];
  function modifieLAgenda(t) { return hasAny(t, MODIF_VERBS); }

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

  /* « Déplace le rendez-vous de 14h à 16h » : les deux heures ne disent pas la
     même chose. Celle qui suit « de » désigne le rendez-vous, celle qui suit
     « à » dit où il va. Sans cette distinction, findTime prenait la première
     venue et cherchait un rendez-vous à l'heure d'arrivée — il n'en trouvait
     évidemment aucun. */
  function heureApres(texte, prepositions) {
    var m = String(texte).match(
      new RegExp('\\b(?:' + prepositions + ')\\s*(\\d{1,2})\\s*(?:h|:)\\s*(\\d{2})?'));
    if (!m) return null;
    var h = parseInt(m[1], 10);
    if (h > 23) return null;
    return (h < 10 ? '0' + h : h) + ':' + (m[2] || '00');
  }
  function heureQuiIdentifie(t) { return heureApres(t, 'de|du|celui'); }

  /* « à 16h » d'abord. Mais on dit aussi « reporte-le à demain 11h », où le
     jour s'intercale entre la préposition et l'heure : le motif direct ne
     voyait rien, et le rendez-vous changeait de jour en gardant son horaire.
     Alors, s'il n'y a qu'une heure dans la phrase et qu'elle ne sert pas à
     désigner le rendez-vous, c'est forcément l'heure d'arrivée. */
  function heureDArrivee(t) {
    var directe = heureApres(t, 'a|vers|pour');
    if (directe) return directe;
    if (heureQuiIdentifie(t)) return null;
    return findTime(t);
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

  /* L'heure de fermeture d'un jour donné, ou null s'il est fermé. */
  function fermetureDe(isoDate) {
    var p = String(isoDate).split('-');
    var cles = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
    var jour = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getDay();
    var plage = window.ALLY_STORE.state.hours.filter(function (h) {
      return h.id === cles[jour] && h.on;
    })[0];
    return plage ? plage.to : null;
  }

  /* Poser un rendez-vous un jour où le cabinet est fermé n'est pas interdit —
     on reçoit parfois hors horaires — mais cela ne doit pas passer inaperçu.
     Ally le signale et laisse décider ; c'est le professionnel qui sait. */
  function avertissementJour(isoDate, heure) {
    var fin = fermetureDe(isoDate);
    if (!fin) return ' Attention : vous êtes fermé ce jour-là.';

    var bloque = (window.ALLY_STORE.data().blocked || []).some(function (b) {
      return b.date === isoDate;
    });
    if (bloque) return ' Attention : vous aviez bloqué cette journée.';

    if (heure) {
      var cles = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
      var p = String(isoDate).split('-');
      var jour = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getDay();
      var plage = window.ALLY_STORE.state.hours.filter(function (h) {
        return h.id === cles[jour] && h.on;
      })[0];
      if (plage && (enMinutes(heure) < enMinutes(plage.from) ||
                    enMinutes(heure) >= enMinutes(plage.to))) {
        return ' Attention : c\'est en dehors de vos horaires (' +
          plage.from + ' – ' + plage.to + ').';
      }
    }
    return '';
  }

  /* Pourquoi ce jour n'a-t-il rien à offrir ? « Rien de libre » est vrai dans
     quatre situations très différentes — fermé, bloqué, déjà fini, complet —
     et la seule réponse utile est celle qui dit laquelle. */
  function pourquoiRien(isoDate) {
    var A = window.ALLY_AGENDA;
    if (!fermetureDe(isoDate)) return 'ferme';
    var bloque = (window.ALLY_STORE.data().blocked || []).some(function (b) {
      return b.date === isoDate;
    });
    if (bloque) return 'bloque';
    if (isoDate === A.TODAY && enMinutes(heureCourante()) >= enMinutes(fermetureDe(isoDate))) {
      return 'fini';
    }
    return 'complet';
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

  /* « Mme Aubert est prévenu » : la faute sautait aux yeux de la seule
     personne à qui elle était adressée. On ne devine pas le genre d'un
     prénom — mais la civilité, elle, est écrite noir sur blanc dans la fiche,
     et c'est la seule chose sur laquelle on accorde. Sans civilité, on ne
     suppose rien : le masculin reste la forme non marquée. */
  function accord(nom) {
    return /^\s*(mme|mlle|madame)\b/i.test(String(nom || '')) ? 'e' : '';
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

  /* La base de connaissances répondait sur un seul mot en commun. « Quel est
     mon chiffre d'affaires ce mois-ci ? » tombait sur la fiche « Droit du
     travail et droit des affaires » — parce qu'elle contient « affaires » — et
     Ally la récitait avec l'aplomb d'une bonne réponse. Une réponse
     confiante et fausse est pire qu'un aveu d'incompréhension : la première
     s'utilise, la seconde fait reposer la question.

     Deux garde-fous, tous deux nécessaires :

     Un mot en commun est une coïncidence, deux sont un sujet. On exige donc
     que la fiche touche au moins deux mots distincts de la question — sauf
     quand la question tient en un ou deux mots (« tarifs ? »), où un mot est
     tout ce qu'on a.

     Et l'intitulé de la fiche pèse plus que son corps : c'est lui qui dit de
     quoi elle traite. Un mot croisé dans un paragraphe de réponse ne prouve
     rien. */
  function faqMatch(text, faq) {
    var asked = expand(keywords(text));
    if (!asked.length) return null;

    var best = null, bestScore = 0, bestTouches = 0;

    faq.forEach(function (item) {
      var titre = keywords(item.q);
      var corps = keywords(item.a);
      var score = 0;
      var touches = 0;

      asked.forEach(function (word) {
        var vu = 0;
        titre.forEach(function (candidate) {
          if (candidate === word) vu = Math.max(vu, 6);
          else if (candidate.indexOf(word) === 0 || word.indexOf(candidate) === 0) vu = Math.max(vu, 3);
        });
        corps.forEach(function (candidate) {
          if (candidate === word) vu = Math.max(vu, 2);
          else if (candidate.indexOf(word) === 0 || word.indexOf(candidate) === 0) vu = Math.max(vu, 1);
        });
        if (vu) { score += vu; touches++; }
      });

      if (score > bestScore) { bestScore = score; bestTouches = touches; best = item; }
    });

    var assezDeMots = bestTouches >= 2 || (asked.length <= 2 && bestTouches >= 1);
    return (bestScore >= 4 && assezDeMots) ? best : null;
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

      /* « Combien il me reste d'appels ? » recevait ici la liste des appels du
         jour. Le mot « appels » est le même, la question ne l'est pas : celle-ci
         porte sur le forfait, et c'est plus bas qu'on y répond. */
      if (hasAny(t, ['qui a appele', 'appels', 'appel recu', 'appele aujourd hui'])
          && !hasAnyLoose(t, ['reste', 'restant', 'restants', 'forfait', 'formule',
            'quota', 'abonnement', 'consomme', 'consommation'])) {
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

      /* « Écris un mail à… » est aussi courant que « envoie un mail à… », et
         ne passait pas : la liste ne connaissait que le second. */
      if (hasAny(t, ['envoie', 'envoyer', 'envoi', 'ecris', 'ecrire', 'redige', 'rediger'])
          && hasAny(t, ['mail', 'email', 'courriel', 'devis', 'compte rendu'])) {
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
          && !modifieLAgenda(t)) {

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
            + ' à ' + nt.replace(':', 'h') + '.' + avertissementJour(iso, nt),
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
      if (hasAny(t, ['prochain rendez vous', 'prochain rdv', 'prochain rendez'])
          && !modifieLAgenda(t)) {
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

      /* ---------- Une période entière ----------
         « Mes rendez-vous de la semaine prochaine » tombait dans le repli : la
         liste par jour ne savait répondre que pour un jour. On lit la période,
         on la parcourt. */
      /* Le mot « mois » ne suffit pas : « je veux bidouiller mon agenda du 32 du
         mois » le contient aussi, et mérite le repli plutôt qu'une liste. Il
         faut en plus une marque de consultation — « mes », « quels »,
         « combien », « montre ». */
      if (parleDeRdv(t) && hasAnyLoose(t, ['semaine', 'mois'])
          && hasAnyLoose(t, ['mes', 'quels', 'quelles', 'combien', 'liste',
            'montre', 'affiche', 'donne moi', 'programme'])
          && !modifieLAgenda(t) && !hasAny(t, CREATE_VERBS)
          && !hasAnyLoose(t, ['libre', 'disponible', 'creneau', 'resume', 'bilan'])) {
        var A7 = window.ALLY_AGENDA;
        var depart7 = resolveWhen(t) || A7.TODAY;
        var duree7 = hasAnyLoose(t, ['mois']) ? 31 : 7;
        var parJour = [];

        for (var d7 = 0; d7 < duree7; d7++) {
          var jour7 = decale(depart7, d7);
          var liste7 = A7.rdvOn(jour7);
          if (liste7.length) parJour.push({ date: jour7, liste: liste7 });
        }

        var total7 = parJour.reduce(function (n, j) { return n + j.liste.length; }, 0);
        if (!total7) {
          return {
            kind: 'answer',
            reply: 'Aucun rendez-vous sur cette période.',
            detail: 'À partir du ' + A7.longLabel(depart7)
          };
        }

        return {
          kind: 'answer',
          reply: total7 + ' rendez-vous : ' + parJour.map(function (j) {
            return A7.shortLabel(j.date) + ' — ' +
              j.liste.map(function (r) { return r.client + ' ' + r.time; }).join(', ');
          }).join(' ; ') + '.',
          detail: 'Du ' + A7.longLabel(depart7) + ' sur ' + duree7 + ' jours'
        };
      }

      if ((parleDeRdv(t) || hasAnyLoose(t, ['planning']))
          && hasAny(t, ['combien', 'quoi', 'journee', 'aujourd hui', 'demain', 'programme', 'ai je'])
          && !modifieLAgenda(t) && !hasAny(t, ['bloque'])
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

      /* ---------- Agenda : modification ----------
         Trois défauts corrigés ici, et le premier était dangereux.

         « Écris un mail à monsieur Petit pour reporter » : le mot « reporte »
         déclenchait ce bloc, qui ne trouvait aucune heure et prenait donc le
         premier rendez-vous à venir — celui de Mme Aubert. Ally proposait
         alors, en toute confiance, de déplacer le rendez-vous d'une personne
         dont il n'avait jamais été question. Un nom cité qu'on ne retrouve
         pas doit arrêter la demande, jamais la rediriger sur quelqu'un
         d'autre.

         « Déplace le rendez-vous de Mme Aubert à 16h » : l'heure d'arrivée
         était prise pour l'heure du rendez-vous, qu'on cherchait donc à 16h —
         introuvable, alors qu'il existait à 14h.

         Et l'heure n'était jamais changée : le rendez-vous changeait de jour
         en gardant son horaire, pendant que la réponse annonçait le contraire. */
      if (hasAny(t, ['deplace', 'decale', 'bouge', 'reporte'])
          && !hasAny(t, ['mail', 'email', 'courriel', 'ecris', 'ecrire'])) {
        var A2 = window.ALLY_AGENDA;
        var nomVise = nomCherche(input);
        var heureVisee = heureQuiIdentifie(t);
        var aVenir = D.rdv.filter(function (r) { return r.date >= A2.TODAY; });
        var target = null;

        if (nomVise) {
          target = D.rdv.filter(function (r) {
            return norm(r.client).indexOf(nomVise) !== -1;
          })[0];
          if (!target) {
            return {
              kind: 'answer',
              reply: 'Aucun rendez-vous à ce nom dans votre agenda. '
                + 'Je préfère vous le dire plutôt que d\'en déplacer un autre.',
              detail: 'Dites-moi le jour et l\'heure, je le retrouverai'
            };
          }
        } else if (heureVisee) {
          target = aVenir.filter(function (r) { return r.time === heureVisee; })[0];
        } else {
          target = aVenir[0];
        }

        if (!target) {
          return { kind: 'answer', reply: 'Je ne trouve pas ce rendez-vous dans votre agenda.' };
        }

        var newDate = resolveWhen(t) || target.date;
        var newTime = heureDArrivee(t) || target.time;
        var who = target.client;
        var quand = A2.longLabel(newDate) + ' à ' + newTime.replace(':', 'h');
        var alerte = avertissementJour(newDate, newTime);

        return {
          kind: 'action', sensitive: true,
          confirm: 'Vous voulez bien que je déplace le rendez-vous de ' + who
            + ' au ' + quand + ' ?' + alerte,
          reply: 'C\'est fait, le rendez-vous de ' + who + ' passe au ' + quand
            + '.' + alerte + ' Je préviens '
            + (p.clientWord === 'patient' ? 'le patient' : 'le client') + '.',
          detail: 'Modification visible dans le calendrier',
          apply: function () {
            var ancienneDate = target.date;
            var ancienneHeure = target.time;
            target.date = newDate;
            target.time = newTime;
            A2.select(newDate);
            store.log('Déplacement de ' + who, 'Reporté au ' + quand);

            if (window.ALLY_SYNC && window.ALLY_SYNC.isReal(target.id)) {
              window.ALLY_SYNC.moveRdv(target.id, newDate, newTime)
                .then(function (result) {
                  if (result && !result.ok) {
                    target.date = ancienneDate;
                    target.time = ancienneHeure;
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

      /* ---------- Temps gagné ----------
         Le chiffre est déjà sur le tableau de bord, avec sa méthode assumée :
         trois minutes par appel pris, quatre par email rédigé. Il n'y avait
         aucune raison qu'Ally sache l'afficher et pas le dire. */
      if (hasAnyLoose(t, ['temps gagne', 'gagne', 'gagner', 'economise', 'fait gagner'])
          && hasAnyLoose(t, ['temps', 'minutes', 'heures', 'combien'])) {
        var uG = store.usage();
        var minutes = uG.calls.used * 3 + uG.emails.used * 4;
        var heures = Math.floor(minutes / 60);
        var reste = minutes % 60;

        return {
          kind: 'answer',
          /* « 12 h 58 » se lit comme une durée mais s'entend comme une heure :
             la synthèse le prononçait « midi cinquante-huit ». On écrit donc
             la durée en toutes lettres — plus clair à lire aussi. */
          reply: minutes < 60
            ? 'Environ ' + minutes + ' minutes ce mois-ci.'
            : 'Environ ' + heures + ' heure' + (heures > 1 ? 's' : '')
              + (reste ? ' et ' + reste + ' minutes' : '') + ' ce mois-ci.',
          /* On donne la méthode avec le chiffre : une estimation dont on cache
             le calcul n'est qu'un chiffre inventé. */
          detail: 'Estimation : 3 min par appel pris à votre place ('
            + uG.calls.used + '), 4 min par email rédigé (' + uG.emails.used + ')'
        };
      }

      /* ---------- Le jour le plus chargé ---------- */
      if (hasAnyLoose(t, ['plus charge', 'plus chargee', 'plus rempli', 'plus occupe'])
          || (hasAnyLoose(t, ['quel jour']) && hasAnyLoose(t, ['charge', 'rempli', 'occupe']))) {
        var A8 = window.ALLY_AGENDA;
        var compte = {};
        D.rdv.forEach(function (r) {
          if (r.date >= A8.TODAY) compte[r.date] = (compte[r.date] || 0) + 1;
        });
        var jours = Object.keys(compte).sort(function (a, b) { return compte[b] - compte[a]; });

        if (!jours.length) {
          return { kind: 'answer', reply: 'Aucun rendez-vous à venir : tous vos jours sont libres.' };
        }
        return {
          kind: 'answer',
          reply: 'Le plus chargé : ' + A8.longLabel(jours[0]) + ', ' + compte[jours[0]]
            + ' rendez-vous.' + (jours[1]
              ? ' Puis ' + A8.longLabel(jours[1]) + ' avec ' + compte[jours[1]] + '.' : ''),
          detail: 'Sur les rendez-vous à venir'
        };
      }

      /* ---------- Les personnes qu'Ally connaît ----------
         Pas un fichier client — Ally n'en tient pas — mais ceux qui ont appelé
         ou qui ont un rendez-vous. Le dire ainsi évite de laisser croire à un
         annuaire qui n'existe pas. */
      if (hasAnyLoose(t, ['mes clients', 'mes patients', 'liste des clients',
            'liste mes clients', 'qui sont mes clients'])) {
        var noms = {};
        D.rdv.forEach(function (r) { if (r.client) noms[r.client] = true; });
        D.calls.forEach(function (c) {
          if (c.caller && !/masque/i.test(c.caller)) noms[c.caller] = true;
        });
        var liste = Object.keys(noms);

        if (!liste.length) {
          return {
            kind: 'answer',
            reply: 'Personne encore : aucun appel reçu, aucun rendez-vous posé.'
          };
        }
        return {
          kind: 'answer',
          reply: liste.length + ' personne' + (liste.length > 1 ? 's' : '')
            + ' dans vos échanges récents : ' + liste.slice(0, 12).join(', ')
            + (liste.length > 12 ? '…' : '') + '.',
          detail: 'Ally ne tient pas de fichier client : ce sont vos appels et '
            + 'vos rendez-vous'
        };
      }

      /* ---------- Ce qui se règle ailleurs ----------
         Ally ne modifie pas son propre script à la voix : le texte qu'elle dira
         à chaque appelant se relit avant d'être posé. On emmène au bon endroit
         plutôt que de laisser tomber dans le repli. */
      if (hasAnyLoose(t, ['phrase d accueil', 'message d accueil', 'script d accueil',
            'ce que tu dis', 'ta phrase'])) {
        return {
          kind: 'answer',
          reply: 'Votre phrase d\'accueil se change dans l\'onglet Ally, avec le '
            + 'bouton d\'écoute juste à côté. Aujourd\'hui elle dit : « '
            + store.greeting() + ' »',
          detail: 'Je ne la modifie pas à la voix : elle est dite à chaque appelant',
          follow: ['Ouvre l\'onglet Ally']
        };
      }

      /* ---------- Forfait ----------
         « Combien il me reste d'appels ? » recevait la liste des appels du
         jour — la question porte sur le forfait, pas sur la journée. C'est
         pourtant celle qu'on pose le plus souvent en fin de mois. */
      if (hasAnyLoose(t, ['forfait', 'formule', 'abonnement', 'quota'])
          || (hasAnyLoose(t, ['reste', 'restant', 'restants', 'consomme', 'consommation'])
              && hasAnyLoose(t, ['appel', 'appels', 'email', 'emails', 'mail', 'mails']))) {
        var u = store.usage();
        var resteAppels = Math.max(0, u.calls.limit - u.calls.used);
        var resteMails = Math.max(0, u.emails.limit - u.emails.used);
        var surcout = store.planData().overage;

        return {
          kind: 'answer',
          reply: 'Formule ' + store.plan() + ' : ' + u.calls.used + ' appels sur '
            + u.calls.limit + ', il vous en reste ' + resteAppels + '. Et '
            + resteMails + ' email' + (resteMails > 1 ? 's' : '') + ' sur '
            + u.emails.limit + '.',
          /* Ce qui se passe au-delà compte autant que le compte lui-même : la
             ligne n'est jamais coupée, les appels sont facturés au détail. */
          detail: resteAppels === 0
            ? 'Au-delà, Ally continue de décrocher — ' +
              String(surcout.toFixed(2)).replace('.', ',') + ' € par appel'
            : (u.real ? 'Compté par le serveur' : 'Compté dans ce navigateur'),
          follow: ['Ouvre mon abonnement']
        };
      }

      /* ---------- Fermer un jour ----------
         « Ferme le cabinet lundi » recevait les horaires d'ouverture : le mot
         « ferme » suffisait à déclencher l'intention qui les récite. C'est un
         ordre, et il a le même effet que « bloque lundi ». */
      if (hasAnyLoose(t, ['ferme', 'fermer', 'fermez'])
          && hasAnyLoose(t, ['cabinet', 'journee', 'jour', 'lundi', 'mardi', 'mercredi',
            'jeudi', 'vendredi', 'samedi', 'dimanche', 'demain', 'aujourd hui'])
          && !hasAnyLoose(t, ['quand', 'quel', 'quelle', 'horaire', 'a quelle heure'])) {
        var A6 = window.ALLY_AGENDA;
        var jourFerme = resolveWhen(t) || A6.TODAY;
        var moitie = findHalf(t) || 'toute la journée';
        var dejaPris = A6.rdvOn(jourFerme);

        return {
          kind: 'action', sensitive: !!dejaPris.length,
          confirm: dejaPris.length
            ? 'Il y a déjà ' + dejaPris.length + ' rendez-vous ' + quandDit(jourFerme)
              + ' (' + dejaPris.map(function (r) { return r.client; }).join(', ')
              + '). Je ferme quand même ?'
            : null,
          reply: A6.longLabel(jourFerme) + ', ' + moitie + ' : c\'est fermé. '
            + 'Ally ne proposera aucun créneau ce jour-là.'
            + (dejaPris.length ? ' Les ' + dejaPris.length
                + ' rendez-vous déjà pris restent à l\'agenda — à vous de les déplacer.' : ''),
          detail: 'Visible en grisé dans le calendrier',
          apply: function () {
            D.blocked.push({ id: Date.now(), date: jourFerme, half: moitie });
            A6.select(jourFerme);
            store.log('Journée fermée', A6.longLabel(jourFerme) + ' — ' + moitie);
          }
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
          /* « Rien de libre dans vos horaires sur la période demandée » était
             exact et inutilisable. Demandé un vendredi à 22 h, il laissait
             croire que la semaine entière était pleine, alors que la journée
             était simplement finie et que lundi 9 h était libre.

             On dit donc laquelle des quatre raisons s'applique — et surtout on
             ne s'arrête pas au constat : la question « suis-je libre ? »
             attend un créneau, pas un refus. */
          var raison = pourquoiRien(depart);
          var suite = null;
          for (var av = 1; av <= 14 && !suite; av++) {
            var apres = decale(depart, av);
            var dispo = creneauxLibres(apres, duree);
            if (dispo.length) suite = { date: apres, heures: dispo };
          }

          var constat = {
            ferme: 'Vous êtes fermé ' + quandDit(depart) + '.',
            bloque: 'Vous avez bloqué la journée ' + quandDit(depart) + '.',
            fini: 'Votre journée est terminée — fermeture à ' + fermetureDe(depart) + '.',
            complet: 'Rien de libre ' + quandDit(depart) + ' : la journée est complète.'
          }[raison];

          var reponse = {
            kind: 'answer',
            reply: constat + (suite
              ? ' Le prochain créneau de ' + duree + ' minutes est ' +
                A5.shortLabel(suite.date) + ' à ' + suite.heures[0] + '.'
              : ' Et rien non plus dans les quinze jours qui suivent.'),
            detail: 'Calculé sur vos horaires, réglés dans Ally → Disponibilités'
          };
          if (suite) {
            reponse.follow = ['Crée un rendez-vous ' + A5.shortLabel(suite.date) +
              ' à ' + suite.heures[0]];
          }
          return reponse;
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
          && !modifieLAgenda(t) && !hasAny(t, ['libre'])) {
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
          reply: suivant.client + ' est prévenu' + accord(suivant.client)
            + (minutes ? ' de vos ' + minutes + ' minutes' : '')
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
