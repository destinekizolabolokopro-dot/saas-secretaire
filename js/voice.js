/* Ally — voix réelle.
   Synthèse (TTS) et reconnaissance (STT) via les API du navigateur, sans
   dépendance ni clé d'API.

   À savoir sur les limites, elles sont réelles :
   - La synthèse fonctionne partout, y compris en ouvrant le fichier en local.
   - La reconnaissance exige un contexte sécurisé (https ou localhost) et
     Chrome/Edge/Safari. Ouvert en file://, le micro est refusé par le
     navigateur : on bascule alors sur la saisie au clavier, et l'interface
     le dit clairement au lieu de faire semblant. */
(function () {
  'use strict';

  var synth = window.speechSynthesis || null;
  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  /* Un contexte sécurisé est nécessaire pour accéder au micro.
     Chrome déclare pourtant file:// comme « sécurisé » alors que la
     reconnaissance y échoue systématiquement : on l'exclut explicitement,
     pour annoncer la vraie raison plutôt qu'un refus de micro trompeur. */
  var isFile = location.protocol === 'file:';
  var secure = !isFile && (
    (window.isSecureContext === true)
    || location.protocol === 'https:'
    || location.hostname === 'localhost'
    || location.hostname === '127.0.0.1');

  var voices = [];
  var listeners = [];

  /* Toutes les voix ne se valent pas, et l'ordre du navigateur ne dit rien de
     leur qualité. Les moteurs récents — « Neural », « Natural », « Premium »,
     « Enhanced », les voix Google et Siri — sont d'une autre génération que les
     voix système historiques : timbre plus riche, liaisons correctes,
     intonation qui monte en fin de question. On les propose donc d'abord, au
     lieu de laisser la personne tomber sur la plus robotique et conclure que
     l'application parle mal. */
  var NATURELLES = /(neural|natural|premium|enhanced|siri|wavenet|studio|journey|multilingual)/i;
  var MOTEURS_SOIGNES = /(google|microsoft|apple)/i;

  /* Les voix distantes sont calculées sur les serveurs de l'éditeur : elles
     sont presque toujours meilleures que celles embarquées dans le système. */
  function qualite(v) {
    var score = 0;
    if (NATURELLES.test(v.name)) score += 4;
    if (MOTEURS_SOIGNES.test(v.name)) score += 2;
    if (v.localService === false) score += 2;
    if (/^fr[-_]FR/i.test(v.lang)) score += 1;
    return score;
  }

  function etiquette(v) {
    if (NATURELLES.test(v.name)) return 'naturelle';
    if (v.localService === false) return 'en ligne';
    return 'système';
  }

  /* Nom présentable : « Microsoft Denise Online (Natural) - French (France) »
     ne tient pas dans un bouton et n'aide personne. */
  function joliNom(v) {
    var nom = String(v.name)
      .replace(/\s*\((.*?)\)/g, '')
      .replace(/^(Microsoft|Google|Apple)\s+/i, '')
      .replace(/\s*-\s*(French|Français).*$/i, '')
      .replace(/\s*(Online|Desktop|Compact|Enhanced|Premium|Natural|Neural)\b/gi, '')
      .replace(/\s+/g, ' ').trim();
    return nom || v.name;
  }

  function loadVoices() {
    if (!synth) return;
    var all = synth.getVoices() || [];
    // On privilégie le français, en repli sur tout le reste.
    var fr = all.filter(function (v) { return /^fr/i.test(v.lang); });
    var retenues = (fr.length ? fr : all).slice();

    /* Deux entrées portent parfois le même nom (une locale, une distante) :
       on garde la meilleure des deux. */
    var vues = {};
    retenues.forEach(function (v) {
      var cle = joliNom(v).toLowerCase();
      if (!vues[cle] || qualite(v) > qualite(vues[cle])) vues[cle] = v;
    });

    voices = Object.keys(vues).map(function (k) { return vues[k]; })
      .sort(function (a, b) { return qualite(b) - qualite(a); })
      .slice(0, 16);

    listeners.forEach(function (fn) { fn(voices); });
  }

  if (synth) {
    loadVoices();
    // Chrome charge les voix de façon asynchrone.
    if (typeof synth.onvoiceschanged !== 'undefined') {
      synth.onvoiceschanged = loadVoices;
    }
  }

  var recognition = null;
  var listening = false;
  var relanceCoupee = function () {};

  window.ALLY_VOICE = {

    /* ---------- Disponibilité ---------- */
    canSpeak: function () { return !!synth; },
    canListen: function () { return !!Recognition && secure; },

    /* Explique précisément pourquoi le micro n'est pas disponible. */
    listenBlockedReason: function () {
      if (!Recognition) {
        return 'Votre navigateur ne gère pas la reconnaissance vocale. '
          + 'Chrome, Edge ou Safari la prennent en charge.';
      }
      if (isFile) {
        return 'Le micro ne fonctionne pas sur un fichier ouvert en local '
          + '(file://). Servez la page en http://localhost ou en https pour dicter. '
          + 'En attendant, écrivez votre demande : Ally répond quand même à voix haute.';
      }
      if (!secure) {
        return 'Le micro exige une page servie en https ou en localhost. '
          + 'Vous pouvez écrire votre demande, Ally répondra à voix haute.';
      }
      return null;
    },

    /* ---------- Voix disponibles ---------- */
    voices: function () { return voices; },

    /* Ce qu'il faut afficher à côté de chaque voix pour choisir sans essayer
       les seize : un nom court, et ce qu'elle vaut. */
    describe: function (v) {
      return { nom: joliNom(v), niveau: etiquette(v), score: qualite(v) };
    },
    onVoices: function (fn) {
      listeners.push(fn);
      if (voices.length) fn(voices);
    },

    /* Retrouve la voix enregistrée dans le compte, sinon la première française. */
    resolveVoice: function (wanted) {
      if (!voices.length) return null;
      var match = voices.filter(function (v) { return v.voiceURI === wanted; })[0];
      return match || voices[0];
    },

    /* ---------- Parole ----------

       Deux choses font toute la différence entre une voix de répondeur et une
       voix qu'on écoute jusqu'au bout.

       D'abord ce qu'on lui donne à lire : « 14:00 » se prononce « quatorze
       deux points zéro zéro » si on le laisse tel quel. js/speech.js réécrit
       le texte pour l'oreille avant de le confier au moteur.

       Ensuite le rythme : une réponse de trois phrases dite d'un seul souffle
       sonne mécanique. On la découpe et on laisse une respiration entre chaque
       phrase — la même voix paraît alors nettement plus humaine. */
    speak: function (text, options, onEnd) {
      if (!synth || !text) { if (onEnd) onEnd(); return null; }
      options = options || {};

      var parler = window.ALLY_SPEECH;
      var lisible = parler ? parler.pourLaVoix(text) : String(text);
      var morceaux = parler ? parler.phrases(lisible) : [lisible];
      if (!morceaux.length) { if (onEnd) onEnd(); return null; }

      synth.cancel();
      var voice = this.resolveVoice(options.voiceURI);
      var self = this;
      var dernier = null;

      function dire(index) {
        if (index >= morceaux.length) { if (onEnd) onEnd(); return; }

        var utter = new SpeechSynthesisUtterance(morceaux[index]);

        /* La liste des voix est mise en cache au chargement, mais le navigateur
           peut la renouveler derrière notre dos — une entrée devient alors
           invalide et l'affectation lève une exception. Sans ce filet, une
           seule voix périmée rendait Ally complètement muette : mieux vaut
           parler avec la voix par défaut que ne pas parler du tout. */
        try {
          if (voice) { utter.voice = voice; utter.lang = voice.lang || 'fr-FR'; }
          else utter.lang = 'fr-FR';
        } catch (e) {
          utter.lang = 'fr-FR';
          loadVoices();
        }

        utter.rate = options.rate || 1;
        utter.pitch = options.pitch || 1;

        /* Une question se termine plus haut qu'une affirmation. Le moteur le
           fait déjà quand le point d'interrogation est là — encore faut-il le
           lui laisser, d'où le découpage qui préserve la ponctuation. */
        utter.onend = function () {
          if (index + 1 >= morceaux.length) { if (onEnd) onEnd(); return; }
          /* Respiration : courte entre deux phrases, un peu plus longue après
             une question, comme quelqu'un qui attend la réponse. */
          var pause = /[?!]\s*$/.test(morceaux[index]) ? 320 : 180;
          window.setTimeout(function () { dire(index + 1); }, pause / (options.rate || 1));
        };
        utter.onerror = function () { if (onEnd) onEnd(); };

        dernier = utter;
        synth.speak(utter);
      }

      dire(0);
      return dernier;
    },

    stopSpeaking: function () { if (synth) synth.cancel(); },
    isSpeaking: function () { return !!synth && synth.speaking; },

    /* ---------- Écoute ---------- */
    /* handlers : { onPartial, onResult, onError, onEnd } */
    listen: function (handlers) {
      if (!this.canListen()) {
        if (handlers.onError) handlers.onError(this.listenBlockedReason());
        return false;
      }
      this.stopListening();

      recognition = new Recognition();
      recognition.lang = 'fr-FR';
      recognition.interimResults = true;
      /* En mode conversation, le micro reste ouvert : on peut enchaîner
         « et demain ? » sans re-cliquer, comme on parlerait à quelqu'un. */
      recognition.continuous = !!handlers.continuous;
      /* Trois hypothèses plutôt qu'une : le navigateur classe parfois en tête
         une transcription absurde alors que la bonne est juste derrière. */
      recognition.maxAlternatives = 3;

      var finalText = '';
      var relance = !!handlers.continuous;
      relanceCoupee = function () { relance = false; };

      recognition.onresult = function (event) {
        var interim = '';
        for (var i = event.resultIndex; i < event.results.length; i++) {
          var chunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalText += chunk;
          else interim += chunk;
        }
        if (interim && handlers.onPartial) handlers.onPartial(interim);
        if (finalText && handlers.onResult) {
          /* Ce que rend la reconnaissance, ce sont des mots : « quatorze heures
             trente », jamais « 14h30 ». Le moteur d'intentions, lui, cherche des
             chiffres. Sans cette traduction, dicter une heure ne marchait pas —
             et c'est pourtant la chose la plus naturelle à dire à voix haute. */
          var dit = finalText.trim();
          handlers.onResult(
            window.ALLY_SPEECH ? window.ALLY_SPEECH.depuisLaVoix(dit) : dit,
            dit
          );
          finalText = '';
        }
      };

      recognition.onerror = function (event) {
        var messages = {
          'not-allowed': 'Accès au micro refusé. Autorisez-le dans les réglages du navigateur.',
          'service-not-allowed': 'Le service de reconnaissance est indisponible sur cette page.',
          'no-speech': 'Je n\'ai rien entendu.',
          'audio-capture': 'Aucun micro détecté sur cet appareil.',
          'network': 'La reconnaissance vocale nécessite une connexion internet.'
        };
        if (handlers.onError) handlers.onError(messages[event.error] || 'Erreur micro : ' + event.error);
      };

      recognition.onend = function () {
        /* Chrome referme la reconnaissance au bout de quelques secondes de
           silence, même en mode continu. On la relance, sinon le micro
           s'éteint tout seul au milieu d'une conversation. */
        if (relance && recognition) {
          try { recognition.start(); return; } catch (e) { /* déjà relancée */ }
        }
        listening = false;
        if (handlers.onEnd) handlers.onEnd();
      };

      try {
        recognition.start();
        listening = true;
        return true;
      } catch (e) {
        if (handlers.onError) handlers.onError('Le micro est déjà en cours d\'utilisation.');
        return false;
      }
    },

    stopListening: function () {
      if (recognition) {
        relanceCoupee();
        try { recognition.stop(); } catch (e) {}
        recognition = null;
      }
      listening = false;
    },

    isListening: function () { return listening; }
  };
})();
