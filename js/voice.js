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

  function loadVoices() {
    if (!synth) return;
    var all = synth.getVoices() || [];
    // On privilégie le français, en repli sur tout le reste.
    var fr = all.filter(function (v) { return /^fr/i.test(v.lang); });
    voices = (fr.length ? fr : all).slice(0, 12);
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

    /* ---------- Parole ---------- */
    speak: function (text, options, onEnd) {
      if (!synth || !text) { if (onEnd) onEnd(); return null; }
      options = options || {};

      synth.cancel();
      var utter = new SpeechSynthesisUtterance(text);
      var voice = this.resolveVoice(options.voiceURI);
      if (voice) { utter.voice = voice; utter.lang = voice.lang; }
      else utter.lang = 'fr-FR';

      utter.rate = options.rate || 1;
      utter.pitch = options.pitch || 1;
      utter.onend = function () { if (onEnd) onEnd(); };
      utter.onerror = function () { if (onEnd) onEnd(); };

      synth.speak(utter);
      return utter;
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
      recognition.continuous = false;
      recognition.maxAlternatives = 1;

      var finalText = '';

      recognition.onresult = function (event) {
        var interim = '';
        for (var i = event.resultIndex; i < event.results.length; i++) {
          var chunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalText += chunk;
          else interim += chunk;
        }
        if (interim && handlers.onPartial) handlers.onPartial(interim);
        if (finalText && handlers.onResult) {
          handlers.onResult(finalText.trim());
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
        try { recognition.stop(); } catch (e) {}
        recognition = null;
      }
      listening = false;
    },

    isListening: function () { return listening; }
  };
})();
