/* Ally — le piège de focus.

   Une fenêtre modale qui ne retient pas le focus n'est modale que pour la
   souris. Au clavier, quelques tabulations suffisent à en sortir sans l'avoir
   fermée : on se retrouve à parcourir une page qu'un voile recouvre, sans
   voir où l'on est. C'est le défaut le plus courant des boîtes de dialogue
   faites à la main, et les trois d'Ally l'avaient — la palette y échappait
   par hasard, parce qu'elle contenait juste assez d'éléments pour que douze
   tabulations n'en fassent pas le tour.

   Trois choses à faire, et une seule façon de les faire bien :

   - poser le focus dans la fenêtre à l'ouverture ;
   - le faire boucler sur ses bords, dans les deux sens ;
   - le rendre à ce qui l'avait, à la fermeture.

   Le dernier point est celui qu'on oublie. Rendu à rien, le focus retombe sur
   le document, et la tabulation suivante repart du tout premier lien de la
   page — l'utilisateur au clavier a perdu sa place sans que rien ne le
   prévienne. */
(function () {
  'use strict';

  /* Ce qui peut recevoir le focus, dans l'ordre du document. On écarte ce qui
     est désactivé, caché, ou explicitement retiré du parcours. */
  var CIBLES = [
    'a[href]', 'button', 'input', 'select', 'textarea',
    '[tabindex]', '[contenteditable="true"]'
  ].join(',');

  function focusables(hote) {
    return Array.prototype.filter.call(hote.querySelectorAll(CIBLES), function (el) {
      if (el.disabled || el.hidden) return false;
      if (el.getAttribute('tabindex') === '-1') return false;
      if (el.type === 'hidden') return false;
      /* Un élément dans une branche masquée n'a pas de boîte. C'est le test le
         plus fiable : il attrape display:none, visibility:hidden et [hidden]
         posé sur un ancêtre, sans avoir à remonter la chaîne soi-même. */
      return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    });
  }

  /* Où renvoyer le focus quand celui qui a ouvert la fenêtre n'existe plus, ou
     qu'il n'y en avait pas — cas d'un raccourci clavier déclenché depuis le
     document. Le contenu principal, rendu focusable pour l'occasion, remet
     l'utilisateur là où il lisait plutôt qu'en haut de page. */
  function repli() {
    var main = document.querySelector('main');
    if (!main) return null;
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    return main;
  }

  function utilisable(el) {
    return el && el.focus && el !== document.body && document.contains(el);
  }

  /* Pose le piège. Renvoie la fonction qui le lève — à appeler à la
     fermeture, une seule fois ; les appels suivants ne font rien. */
  function piege(hote, options) {
    var opts = options || {};
    var precedent = utilisable(document.activeElement) ? document.activeElement : null;
    var leve = false;

    function surTouche(event) {
      if (event.key !== 'Tab') return;
      var liste = focusables(hote);
      if (!liste.length) { event.preventDefault(); return; }

      var premier = liste[0];
      var dernier = liste[liste.length - 1];
      var courant = document.activeElement;

      /* Hors de la fenêtre — un script a déplacé le focus, ou le navigateur
         est passé par la barre d'adresse : on le ramène. */
      if (!hote.contains(courant)) {
        event.preventDefault();
        (event.shiftKey ? dernier : premier).focus();
        return;
      }
      if (event.shiftKey && courant === premier) {
        event.preventDefault();
        dernier.focus();
      } else if (!event.shiftKey && courant === dernier) {
        event.preventDefault();
        premier.focus();
      }
    }

    document.addEventListener('keydown', surTouche, true);

    /* Le focus initial : celui qu'on demande, sinon le premier venu, sinon la
       fenêtre elle-même — une fenêtre sans rien de focusable reste préférable
       à un focus resté derrière le voile. */
    var depart = (opts.premier && utilisable(opts.premier) ? opts.premier : null) ||
      focusables(hote)[0];
    if (depart) {
      depart.focus();
    } else {
      if (!hote.hasAttribute('tabindex')) hote.setAttribute('tabindex', '-1');
      hote.focus();
    }

    return function relache() {
      if (leve) return;
      leve = true;
      document.removeEventListener('keydown', surTouche, true);
      var retour = utilisable(precedent) ? precedent : repli();
      if (retour) retour.focus();
    };
  }

  window.ALLY_FOCUS = { piege: piege, focusables: focusables };
})();
