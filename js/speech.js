/* Ally — comment Ally prononce ce qu'elle dit.

   La voix de synthèse du navigateur lit le texte tel qu'il est écrit. Ce qui
   est parfait pour un écran est mauvais à l'oreille : « 14:00 » se prononce
   « quatorze deux points zéro zéro », « M. Lefebvre » devient « M point
   Lefebvre », « 06 12 34 56 78 » se récite chiffre par chiffre à toute vitesse,
   et « 180 € » finit en « cent quatre-vingts E-U-R-O ».

   Ce module réécrit donc le texte pour l'oreille avant de le confier à la
   synthèse. C'est le levier le plus efficace sur le naturel d'une voix :
   changer de moteur vocal se remarque moins que d'arrêter d'épeler les heures.

   Il découpe aussi les phrases : une longue réponse dite d'un seul souffle
   sonne comme un répondeur des années 2000. Prononcée phrase par phrase, avec
   une respiration entre chacune, la même voix paraît nettement plus humaine. */
(function () {
  'use strict';

  /* ------------------------------------------------------------- Nombres */

  var UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept',
    'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze',
    'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];

  var TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante',
    'soixante', 'quatre-vingt', 'quatre-vingt'];

  /* Français de France : soixante-dix, quatre-vingt-dix. C'est la langue des
     clients d'Ally, pas celle des manuels. */
  function underHundred(n) {
    if (n < 20) return UNITS[n];
    var ten = Math.floor(n / 10);
    var unit = n % 10;

    if (ten === 7 || ten === 9) {
      var base = TENS[ten];
      var reste = UNITS[10 + unit];
      return base + '-' + reste;
    }
    if (unit === 0) return TENS[ten] + (ten === 8 ? 's' : '');
    if (unit === 1 && ten !== 8) return TENS[ten] + ' et un';
    return TENS[ten] + '-' + UNITS[unit];
  }

  function underThousand(n) {
    if (n < 100) return underHundred(n);
    var hundreds = Math.floor(n / 100);
    var reste = n % 100;
    var tete = hundreds === 1 ? 'cent' : UNITS[hundreds] + ' cent';
    if (reste === 0) return tete + (hundreds > 1 ? 's' : '');
    return tete + ' ' + underHundred(reste);
  }

  function enLettres(n) {
    n = Math.floor(Math.abs(Number(n) || 0));
    if (n < 1000) return underThousand(n);
    if (n < 1000000) {
      var milliers = Math.floor(n / 1000);
      var reste = n % 1000;
      var tete = milliers === 1 ? 'mille' : underThousand(milliers) + ' mille';
      return reste ? tete + ' ' + underThousand(reste) : tete;
    }
    var millions = Math.floor(n / 1000000);
    var suite = n % 1000000;
    var debut = (millions === 1 ? 'un million' : underThousand(millions) + ' millions');
    return suite ? debut + ' ' + enLettres(suite) : debut;
  }

  /* ------------------------------------------------------------- Heures */

  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
    'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  function heure(h, m) {
    h = Number(h); m = Number(m || 0);
    if (h === 0 && m === 0) return 'minuit';
    if (h === 12 && m === 0) return 'midi';

    /* « une heure », pas « un heure » : le nombre s'accorde. */
    var dit = h === 12 ? 'midi'
      : h === 0 ? 'minuit'
      : (h === 1 ? 'une heure' : enLettres(h) + ' heures');
    if (!m) return dit;
    if (m === 15) return dit + ' et quart';
    if (m === 30) return dit + (h === 12 || h === 0 ? ' et demi' : ' et demie');
    if (m === 45) {
      var suivante = (h + 1) % 24;
      if (suivante === 0) return 'minuit moins le quart';
      if (suivante === 12) return 'midi moins le quart';
      return (suivante === 1 ? 'une heure' : enLettres(suivante) + ' heures') + ' moins le quart';
    }
    return dit + ' ' + enLettres(m);
  }

  /* ---------------------------------------------------------- Abréviations */

  /* Ordre important : les plus longues d'abord, sinon « Mme » devient
     « Monsieurme ». */
  var TITRES = [
    [/\bMme\.?\b/g, 'Madame'],
    [/\bMlle\.?\b/g, 'Mademoiselle'],
    [/\bMM\.\b/g, 'Messieurs'],
    [/\bM\.\s/g, 'Monsieur '],
    [/\bMe\s(?=[A-ZÉÈÀ])/g, 'Maître '],
    [/\bMtre\.?\b/g, 'Maître'],
    [/\bDr\.?\s/g, 'Docteur '],
    [/\bPr\.?\s/g, 'Professeur ']
  ];

  var SIGLES = [
    [/\bRDV\b/gi, 'rendez-vous'],
    [/\bRIB\b/g, 'R.I.B.'],
    [/\bTVA\b/g, 'T.V.A.'],
    [/\bSMS\b/g, 'S.M.S.'],
    [/\bCB\b/g, 'carte bancaire'],
    [/\bn°\s?/gi, 'numéro '],
    [/\bN°\s?/g, 'numéro '],
    [/\bStè?\b\.?/g, 'Société'],
    [/\betc\.\b/gi, 'et cetera'],
    [/\bcf\.\b/gi, 'voir'],
    [/\bmin\b/g, 'minutes'],
    [/\bh\/j\b/g, 'heures par jour'],
    [/&/g, ' et ']
  ];

  /* ------------------------------------------------------------- Téléphone */

  /* Un numéro français se dit par paires : « zéro six, douze, trente-quatre… ».
     Chiffre par chiffre, l'appelant ne retient rien. */
  function numeroTelephone(brut) {
    var chiffres = brut.replace(/[^\d]/g, '');
    if (chiffres.length !== 10) return brut;

    var paires = [];
    for (var i = 0; i < 10; i += 2) paires.push(chiffres.slice(i, i + 2));

    var dit = 'zéro ' + enLettres(Number(paires[0][1]));
    for (var j = 1; j < paires.length; j++) {
      dit += ', ' + enLettres(Number(paires[j]));
    }
    return dit;
  }

  /* --------------------------------------------------------------- Texte */

  function pourLaVoix(texte) {
    var out = ' ' + String(texte || '') + ' ';

    /* Les balises et les artefacts d'écran ne se prononcent pas. */
    out = out.replace(/<[^>]+>/g, ' ').replace(/[*_`]/g, '');

    /* Numéros de téléphone d'abord : ils contiennent des groupes de chiffres
       que les règles suivantes déformeraient. */
    out = out.replace(/\b0\s?\d(?:[\s.-]?\d{2}){4}\b/g, function (m) {
      return numeroTelephone(m);
    });

    TITRES.forEach(function (rule) { out = out.replace(rule[0], rule[1]); });

    /* Heures : 14:00, 14h, 14h30, 9 h 15. */
    out = out.replace(/\b(\d{1,2})\s*[:h]\s*(\d{2})\b/g, function (m, h, mn) {
      return heure(h, mn);
    });
    out = out.replace(/\b(\d{1,2})\s*h\b/gi, function (m, h) { return heure(h, 0); });

    /* Dates : 14/09, 14/09/2026, et le format ISO qui traîne parfois. */
    out = out.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, function (m, y, mo, d) {
      return enLettres(Number(d)) + ' ' + (MOIS[Number(mo) - 1] || '') + ' ' + enLettres(Number(y));
    });
    out = out.replace(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g, function (m, d, mo, y) {
      var dit = (Number(d) === 1 ? 'premier' : enLettres(Number(d))) + ' ' + (MOIS[Number(mo) - 1] || '');
      return y ? dit + ' ' + enLettres(Number(y.length === 2 ? '20' + y : y)) : dit;
    });

    /* Monnaie et pourcentages, avant les nombres nus. */
    out = out.replace(/(\d+(?:[\s\u00a0\u202f]\d{3})*(?:[.,]\d+)?)\s?€/g, function (m, n) {
      var parts = String(n).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.').split('.');
      var euros = enLettres(parts[0]) + (Number(parts[0]) === 1 ? ' euro' : ' euros');
      if (!parts[1] || Number(parts[1]) === 0) return euros;
      return euros + ' ' + enLettres(parts[1]);
    });
    out = out.replace(/(\d+)\s?%/g, function (m, n) { return enLettres(n) + ' pour cent'; });

    /* Ordinaux courants. */
    out = out.replace(/\b1(?:er|ère)\b/g, 'premier');
    out = out.replace(/\b(\d+)(?:e|ème)\b/g, function (m, n) {
      var mots = { 2: 'deuxième', 3: 'troisième', 4: 'quatrième', 5: 'cinquième' };
      return mots[n] || enLettres(n) + 'ième';
    });

    SIGLES.forEach(function (rule) { out = out.replace(rule[0], rule[1]); });

    /* Adresses email : « chez » se comprend mieux que « arobase », et le point
       final d'un domaine ne doit pas passer pour une fin de phrase. */
    out = out.replace(/([\w.+-]+)@([\w-]+)\.(\w{2,})/g, function (m, a, b, c) {
      return a.replace(/\./g, ' point ') + ' arobase ' + b + ' point ' + c;
    });

    /* Milliers écrits avec une espace — « 1 250 » — avant tout le reste :
       traités chiffre par groupe, ils devenaient « un, deux cent cinquante ». */
    out = out.replace(/\b(\d{1,3})(?:[  ](\d{3}))+\b/g, function (m) {
      return enLettres(m.replace(/[^\d]/g, ''));
    });

    /* Milliers écrits avec une espace — « 1 250 » — avant tout le reste :
       découpés en groupes, ils devenaient « un, deux cent cinquante ». */
    out = out.replace(/\b\d{1,3}(?:[\s\u00a0\u202f]\d{3})+\b/g, function (m) {
      return enLettres(m.replace(/[^\d]/g, ''));
    });

    /* Nombres restants, jusqu'à quatre chiffres : au-delà, la synthèse s'en
       sort correctement et l'énoncé deviendrait interminable. */
    out = out.replace(/\b(\d{1,4})\b/g, function (m, n) { return enLettres(n); });

    return out.replace(/\s+/g, ' ').trim();
  }

  /* Découpe en phrases, pour respirer entre chacune. On ne coupe pas sur les
     points d'abréviation restants ni sur les décimales. */
  function phrases(texte) {
    return String(texte || '')
      .split(/(?<=[.!?…])\s+(?=[A-ZÉÈÀÂÎÔÙ])|\n+/)
      .map(function (p) { return p.trim(); })
      .filter(function (p) { return p.length; });
  }

  /* ------------------------------------------------- Dans l'autre sens

     La reconnaissance vocale rend des mots, pas des chiffres : on dit
     « quatorze heures trente » et le navigateur écrit « quatorze heures
     trente ». Le moteur d'intentions, lui, cherche « 14h30 ». Sans cette
     traduction, dicter une heure ne marchait tout simplement pas — et c'est
     l'usage le plus naturel qui soit au téléphone.

     On ne touche qu'aux nombres et aux formules de temps : le reste du texte
     dicté doit rester exactement ce que la personne a dit. */

  var MOTS_NOMBRES = {
    'zero': 0, 'un': 1, 'une': 1, 'deux': 2, 'trois': 3, 'quatre': 4,
    'cinq': 5, 'six': 6, 'sept': 7, 'huit': 8, 'neuf': 9, 'dix': 10,
    'onze': 11, 'douze': 12, 'treize': 13, 'quatorze': 14, 'quinze': 15,
    'seize': 16, 'vingt': 20, 'trente': 30, 'quarante': 40, 'cinquante': 50,
    'soixante': 60, 'cent': 100, 'cents': 100, 'mille': 1000
  };

  /* Additionne une suite de mots-nombres : « vingt trois » → 23,
     « quatre vingt dix sept » → 97, « deux cent cinquante » → 250. */
  function valeurDe(mots) {
    var total = 0, courant = 0, vu = false;

    /* Un nombre ne commence jamais par « et » : sans cette garde, « vingt-trois
       appels et deux cents euros » perdait le « et » en chemin. */
    if (!mots.length || mots[0] === 'et') return null;

    for (var i = 0; i < mots.length; i++) {
      var mot = mots[i];
      if (mot === 'et') {
        /* « et » ne se poursuit que dans « vingt et un » et « et demie ». */
        var apresEt = MOTS_NOMBRES[mots[i + 1]];
        if (apresEt === undefined || apresEt >= 20) return { valeur: total + courant, reste: i };
        continue;
      }

      /* « dix-sept », « soixante-dix » : on additionne les morceaux. */
      var morceaux = mot.split('-');
      var valeurMot = 0, reconnu = false;
      for (var j = 0; j < morceaux.length; j++) {
        var v = MOTS_NOMBRES[morceaux[j]];
        if (v === undefined) { reconnu = false; break; }
        reconnu = true;
        if (v === 100 || v === 1000) valeurMot = (valeurMot || 1) * v;
        else valeurMot += v;
      }
      if (!reconnu) return vu ? { valeur: total + courant, reste: i } : null;

      vu = true;
      if (valeurMot === 1000) { total += (courant || 1) * 1000; courant = 0; }
      else if (valeurMot === 100) { courant = (courant || 1) * 100; }
      else courant += valeurMot;
    }
    return vu ? { valeur: total + courant, reste: mots.length } : null;
  }

  function depuisLaVoix(texte) {
    var t = ' ' + String(texte || '').toLowerCase() + ' ';

    /* Formules de temps d'abord : elles se lisent mieux avant que les nombres
       ne deviennent des chiffres. */
    t = t.replace(/\bmidi et demie?\b/g, '12h30').replace(/\bmidi\b/g, '12h');
    t = t.replace(/\bminuit et demie?\b/g, '00h30').replace(/\bminuit\b/g, '00h');

    /* « quatorze heures trente », « neuf heures et quart », « dix heures
       moins le quart », « une heure ». */
    var mots = t.trim().split(/\s+/);
    var sortie = [];

    for (var i = 0; i < mots.length; i++) {
      var suite = mots.slice(i, i + 5);
      var lu = valeurDe(suite);

      if (lu && lu.valeur !== null) {
        var apres = mots[i + lu.reste];
        var estHeure = /^heures?$/.test(apres || '');

        if (estHeure && lu.valeur <= 24) {
          var h = lu.valeur === 24 ? 0 : lu.valeur;
          var reste = mots.slice(i + lu.reste + 1);
          var minutes = 0, consomme = 0;

          if (/^et$/.test(reste[0] || '') && /^demies?$/.test(reste[1] || '')) {
            minutes = 30; consomme = 2;
          } else if (/^et$/.test(reste[0] || '') && /^quarts?$/.test(reste[1] || '')) {
            minutes = 15; consomme = 2;
          } else if (/^moins$/.test(reste[0] || '') && /^(le|un)$/.test(reste[1] || '')
                     && /^quarts?$/.test(reste[2] || '')) {
            minutes = 45; h = (h + 23) % 24; consomme = 3;
          } else {
            var apresHeure = valeurDe(reste.slice(0, 3));
            if (apresHeure && apresHeure.valeur > 0 && apresHeure.valeur < 60) {
              minutes = apresHeure.valeur; consomme = apresHeure.reste;
            }
          }

          sortie.push((h < 10 ? '0' + h : h) + 'h' + (minutes < 10 ? '0' + minutes : minutes));
          i += lu.reste + consomme;
          continue;
        }

        /* « un » et « une » restent des articles tant qu'ils ne sont pas
           suivis d'une unité : « crée un rendez-vous » ne doit pas devenir
           « crée 1 rendez-vous », qui ne veut plus rien dire. */
        var seul = lu.reste === 1 && /^(un|une)$/.test(mots[i]);

        /* Nombre ordinaire : on l'écrit en chiffres, ce que le moteur lit. */
        if (lu.reste > 0 && !seul) {
          sortie.push(String(lu.valeur));
          i += lu.reste - 1;
          continue;
        }
      }
      sortie.push(mots[i]);
    }

    return sortie.join(' ').replace(/\s+/g, ' ').trim();
  }

  window.ALLY_SPEECH = {
    pourLaVoix: pourLaVoix,
    depuisLaVoix: depuisLaVoix,
    phrases: phrases,
    enLettres: enLettres,
    heure: heure,
    numeroTelephone: numeroTelephone
  };
})();
