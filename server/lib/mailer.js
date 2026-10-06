/* Ally — l'envoi d'emails.

   Jusqu'ici il n'y en avait aucun, et c'était le défaut qui empêchait toute
   mise en ligne : en production, le code de vérification cessait d'être
   renvoyé dans la réponse HTTP — c'est la bonne décision, un code qui transite
   par la page est un code public — mais rien ne le postait. L'inscription
   créait donc un compte que personne ne pouvait jamais confirmer.

   Deux fournisseurs, sans aucune dépendance : Brevo par son API HTTPS, ou un
   relais SMTP quelconque. Et un troisième mode, assumé : pas d'envoi du tout,
   le code s'affiche à l'écran — c'est ce qui fait tourner la démonstration, et
   c'est refusé en production.

   La règle, posée au démarrage : on ne lance pas en production un parcours qui
   exige un code que rien n'envoie. Le serveur refuse de démarrer plutôt que
   d'accepter des inscriptions mortes-nées. */
'use strict';

const https = require('node:https');
const net = require('node:net');
const tls = require('node:tls');
const crypto = require('node:crypto');

const EXPEDITEUR_DEFAUT = 'Ally';

function config() {
  const brevo = (process.env.BREVO_API_KEY || '').trim();
  const smtp = (process.env.SMTP_URL || '').trim();
  const from = (process.env.ALLY_MAIL_FROM || '').trim();
  const nom = (process.env.ALLY_MAIL_FROM_NAME || EXPEDITEUR_DEFAUT).trim();

  if (brevo) return { mode: 'brevo', cle: brevo, from, nom };
  if (smtp) return { mode: 'smtp', url: smtp, from, nom };
  return { mode: 'aucun', from, nom };
}

/* ------------------------------------------------------------------ Brevo */

function envoyerBrevo(cfg, message) {
  const charge = JSON.stringify({
    sender: { email: cfg.from, name: cfg.nom },
    to: [{ email: message.to }],
    subject: message.subject,
    textContent: message.text,
    htmlContent: message.html
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.brevo.com',
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'api-key': cfg.cle,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(charge)
      },
      timeout: 10000
    }, (res) => {
      let corps = '';
      res.on('data', (c) => { corps += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve({ ok: true });
        /* Le corps de la réponse de Brevo peut contenir l'adresse du
           destinataire : on garde le code, pas le détail. */
        reject(new Error('Brevo a répondu ' + res.statusCode));
      });
    });

    req.on('timeout', () => { req.destroy(new Error('Brevo : délai dépassé')); });
    req.on('error', reject);
    req.end(charge);
  });
}

/* ------------------------------------------------------------------- SMTP

   Un client SMTP minimal — EHLO, STARTTLS si besoin, AUTH LOGIN, DATA. Il ne
   couvre que ce dont ce produit a besoin : un message texte + HTML à un seul
   destinataire. Tout le reste d'un vrai client (pièces jointes, encodages
   exotiques, files d'attente) n'a pas sa place ici. */

function dialogueSMTP(socket, attendu) {
  return new Promise((resolve, reject) => {
    let tampon = '';
    const onData = (chunk) => {
      tampon += chunk.toString('utf8');
      /* Une réponse SMTP se termine par une ligne « NNN<espace> ». Les lignes
         « NNN-… » sont des continuations. */
      const lignes = tampon.split(/\r?\n/).filter(Boolean);
      const derniere = lignes[lignes.length - 1] || '';
      if (!/^\d{3} /.test(derniere)) return;

      socket.removeListener('data', onData);
      socket.removeListener('error', onErr);
      const code = Number(derniere.slice(0, 3));
      if (attendu && !attendu.includes(code)) {
        return reject(new Error('SMTP a répondu ' + code));
      }
      resolve({ code, texte: tampon });
    };
    const onErr = (e) => {
      socket.removeListener('data', onData);
      reject(e);
    };
    socket.on('data', onData);
    socket.once('error', onErr);
  });
}

function dire(socket, ligne, attendu) {
  socket.write(ligne + '\r\n');
  return dialogueSMTP(socket, attendu);
}

async function envoyerSMTP(cfg, message) {
  const url = new URL(cfg.url);
  const securise = url.protocol === 'smtps:';
  const port = Number(url.port || (securise ? 465 : 587));
  const hote = url.hostname;
  const user = decodeURIComponent(url.username || '');
  const pass = decodeURIComponent(url.password || '');

  let socket = securise
    ? tls.connect({ host: hote, port, servername: hote })
    : net.connect({ host: hote, port });

  socket.setTimeout(15000);
  const fini = new Promise((_, rej) => {
    socket.once('timeout', () => { socket.destroy(); rej(new Error('SMTP : délai dépassé')); });
  });

  const travail = (async () => {
    await new Promise((res, rej) => {
      socket.once(securise ? 'secureConnect' : 'connect', res);
      socket.once('error', rej);
    });
    await dialogueSMTP(socket, [220]);
    const salut = await dire(socket, 'EHLO ally', [250]);

    if (!securise && /STARTTLS/i.test(salut.texte)) {
      await dire(socket, 'STARTTLS', [220]);
      socket = tls.connect({ socket, servername: hote });
      await new Promise((res, rej) => {
        socket.once('secureConnect', res);
        socket.once('error', rej);
      });
      await dire(socket, 'EHLO ally', [250]);
    }

    if (user) {
      await dire(socket, 'AUTH LOGIN', [334]);
      await dire(socket, Buffer.from(user).toString('base64'), [334]);
      await dire(socket, Buffer.from(pass).toString('base64'), [235]);
    }

    await dire(socket, 'MAIL FROM:<' + cfg.from + '>', [250]);
    await dire(socket, 'RCPT TO:<' + message.to + '>', [250, 251]);
    await dire(socket, 'DATA', [354]);

    const limite = 'ally-' + crypto.randomBytes(12).toString('hex');
    const corps = [
      'From: ' + cfg.nom + ' <' + cfg.from + '>',
      'To: <' + message.to + '>',
      'Subject: =?UTF-8?B?' + Buffer.from(message.subject).toString('base64') + '?=',
      'MIME-Version: 1.0',
      'Content-Type: multipart/alternative; boundary="' + limite + '"',
      '',
      '--' + limite,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(message.text).toString('base64'),
      '--' + limite,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(message.html).toString('base64'),
      '--' + limite + '--',
      '.'
    ].join('\r\n');

    socket.write(corps + '\r\n');
    await dialogueSMTP(socket, [250]);
    await dire(socket, 'QUIT', [221]).catch(() => {});
    socket.end();
    return { ok: true };
  })();

  try {
    return await Promise.race([travail, fini]);
  } finally {
    if (!socket.destroyed) socket.destroy();
  }
}

/* ------------------------------------------------------------- Les lettres

   Deux seulement, et les mêmes mots que l'écran : un code à six chiffres, ce
   qu'il ouvre, et combien de temps il vaut. Rien d'autre — pas de pixel de
   suivi, pas de lien de désinscription sur un email transactionnel. */

const LETTRES = {
  verify: {
    subject: 'Votre code Ally',
    titre: 'Confirmez votre adresse',
    phrase: 'Voici le code qui confirme votre adresse et ouvre votre espace Ally.'
  },
  reset: {
    subject: 'Réinitialiser votre mot de passe Ally',
    titre: 'Nouveau mot de passe',
    phrase: 'Voici le code qui vous permet de choisir un nouveau mot de passe.'
  },
  invite: {
    subject: 'Vous êtes invité sur Ally',
    titre: 'Rejoignez votre cabinet',
    phrase: 'Un collaborateur vous a invité. Ce code ouvre votre accès.'
  }
};

function lettre(kind, code, minutes) {
  const l = LETTRES[kind] || LETTRES.verify;
  const texte = [
    l.titre,
    '',
    l.phrase,
    '',
    'Code : ' + code,
    '',
    'Il est valable ' + minutes + ' minutes et ne sert qu\'une fois.',
    'Si vous n\'êtes à l\'origine d\'aucune demande, ignorez ce message.',
    '',
    'Ally — assistant IA pour professionnels seuls'
  ].join('\n');

  const html = '<!doctype html><html lang="fr"><body style="margin:0;padding:32px 16px;' +
    'background:#0d0d14;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">' +
    '<table role="presentation" style="max-width:480px;margin:0 auto;background:#17171f;' +
    'border:1px solid #2a2a36;border-radius:16px;padding:32px"><tr><td>' +
    '<p style="margin:0 0 6px;font-size:20px;font-weight:700;color:#f2f2f5">' + l.titre + '</p>' +
    '<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#a8a8b8">' + l.phrase + '</p>' +
    '<p style="margin:0 0 24px;font-size:32px;font-weight:700;letter-spacing:.22em;' +
    'color:#f2f2f5;background:#20202a;border-radius:12px;padding:18px;text-align:center">' +
    code + '</p>' +
    '<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#8a8a9a">Il est valable ' +
    minutes + ' minutes et ne sert qu\'une fois.</p>' +
    '<p style="margin:0;font-size:13px;line-height:1.6;color:#8a8a9a">Si vous n\'êtes à ' +
    'l\'origine d\'aucune demande, ignorez ce message.</p>' +
    '</td></tr></table>' +
    '<p style="max-width:480px;margin:18px auto 0;font-size:11px;color:#6a6a7a;text-align:center">' +
    'Ally — assistant IA pour professionnels seuls</p>' +
    '</body></html>';

  return { subject: l.subject, text: texte, html };
}

/* --------------------------------------------------------------- Interface */

/* Envoie, et dit si c'est parti. Un échec d'envoi n'est jamais silencieux : il
   remonte à l'appelant, qui décide quoi en faire — l'inscription, elle, ne
   doit pas échouer parce que le fournisseur d'emails a hoqueté. */
async function envoyerCode(destinataire, kind, code, minutes) {
  const cfg = config();
  if (cfg.mode === 'aucun') return { ok: false, mode: 'aucun' };
  if (!cfg.from) return { ok: false, mode: cfg.mode, error: 'ALLY_MAIL_FROM manquante.' };

  const message = Object.assign({ to: destinataire }, lettre(kind, code, minutes));

  try {
    if (cfg.mode === 'brevo') await envoyerBrevo(cfg, message);
    else await envoyerSMTP(cfg, message);
    return { ok: true, mode: cfg.mode };
  } catch (error) {
    return { ok: false, mode: cfg.mode, error: error.message };
  }
}

/* Ce que le serveur annonce au démarrage, et ce sur quoi il refuse de partir. */
function etat() {
  const cfg = config();
  const mode = (process.env.ALLY_VERIFY_MODE || '').trim() || 'email';
  const production = process.env.NODE_ENV === 'production';

  if (mode !== 'email' && mode !== 'open') {
    return { ok: false, fatal: production, mode, envoi: cfg.mode,
      message: 'ALLY_VERIFY_MODE doit valoir « email » ou « open ».' };
  }

  if (mode === 'open') {
    return { ok: true, mode: 'open', envoi: cfg.mode,
      message: 'vérification désactivée — les comptes sont actifs dès l\'inscription' };
  }

  if (cfg.mode === 'aucun') {
    return {
      ok: !production, fatal: production, mode: 'email', envoi: 'aucun',
      message: production
        ? 'vérification par email demandée, mais aucun fournisseur configuré : '
          + 'les comptes créés ne pourraient jamais être confirmés. '
          + 'Renseignez BREVO_API_KEY ou SMTP_URL, ou passez ALLY_VERIFY_MODE=open.'
        : 'aucun fournisseur d\'emails — les codes s\'affichent à l\'écran (développement)'
    };
  }

  if (!cfg.from) {
    return { ok: false, fatal: production, mode: 'email', envoi: cfg.mode,
      message: 'ALLY_MAIL_FROM manquante : le fournisseur refusera les envois.' };
  }

  return { ok: true, mode: 'email', envoi: cfg.mode,
    message: 'codes envoyés par ' + cfg.mode + ' depuis ' + cfg.from };
}

/* Le parcours exige-t-il un code ? */
function verificationRequise() {
  return ((process.env.ALLY_VERIFY_MODE || '').trim() || 'email') !== 'open';
}

module.exports = { envoyerCode, etat, verificationRequise, lettre, config };
