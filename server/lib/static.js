/* Ally — service des fichiers du front.

   Le serveur sert aussi la maquette, pour qu'une seule commande fasse tourner
   l'ensemble : `node server/index.js` puis http://localhost:8787.

   En production, ces fichiers seront servis par l'hébergeur ou un CDN, pas par
   l'API. Ce module reste néanmoins écrit sérieusement : un service de fichiers
   naïf est l'un des moyens les plus simples de laisser lire /etc/passwd. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

/* Dossiers que le serveur n'expose jamais, même si un fichier y existe. */
const HIDDEN = ['server', 'node_modules', '.git'];

/* En-têtes posés sur chaque page.

   La politique de contenu est la deuxième ligne de défense contre l'injection :
   la première est l'échappement, systématique dans le front, mais un oubli
   suffit — et cette maquette affiche des résumés d'appels et des corps d'emails
   écrits par des tiers. Avec cette politique, un script injecté ne s'exécute
   pas, et rien ne peut être exfiltré vers un autre domaine.

   « unsafe-inline » reste nécessaire pour les styles : la maquette pose des
   attributs style un peu partout. Pour les scripts, non — d'où le nonce. */
function securityHeaders(nonce) {
  return {
    'content-security-policy': [
      "default-src 'self'",
      "script-src 'self' 'nonce-" + nonce + "'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "media-src 'self'",
      "form-action 'self'",
      "base-uri 'none'",
      /* Personne n'affiche Ally dans une iframe : c'est ainsi qu'on habille un
         faux écran de connexion par-dessus le vrai. */
      "frame-ancestors 'none'",
      "object-src 'none'"
    ].join('; '),
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'same-origin',
    /* Le micro sert à Ally, sur cette page et nulle part ailleurs. */
    'permissions-policy': 'microphone=(self), camera=(), geolocation=(), payment=()'
  };
}

function serve(req, res, pathname) {
  /* On refuse tout ce qui n'est pas une lecture. */
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;

  /* Un chemin mal encodé — « /% » — fait lever decodeURIComponent. Sans ce
     filet, une adresse tapée de travers répondait 500 au lieu de 404. */
  let clean;
  try { clean = decodeURIComponent(pathname.split('?')[0]); }
  catch (e) { return false; }

  const relative = clean === '/' ? 'index.html' : clean.replace(/^\/+/, '');

  /* Traversée de répertoire : on résout, puis on vérifie que le résultat est
     bien sous la racine. Filtrer « .. » à la main laisse passer les variantes
     encodées ; comparer les chemins résolus, non. */
  const target = path.resolve(ROOT, relative);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end('Interdit');
    return true;
  }

  const first = path.relative(ROOT, target).split(path.sep)[0];
  if (HIDDEN.includes(first)) {
    res.writeHead(404).end('Introuvable');
    return true;
  }

  let stat;
  try { stat = fs.statSync(target); }
  catch (e) { return false; }
  if (!stat.isFile()) return false;

  const extension = path.extname(target).toLowerCase();
  const type = TYPES[extension] || 'application/octet-stream';

  /* Les pages servies par l'API la déclarent. Sans ce marqueur, le front ne
     tente aucune requête : sur un hébergeur statique, sonder /api/health
     produirait un 404 rouge dans la console de chaque visiteur, pour un état
     parfaitement normal — il n'y a simplement pas d'API. */
  if (extension === '.html') {
    /* Un nonce par réponse. Il autorise nos scripts en ligne — celui qu'on
       injecte, et celui du fichier de démonstration autonome — sans ouvrir la
       porte à un script injecté par ailleurs, qui ne pourra pas le deviner. */
    const nonce = crypto.randomBytes(16).toString('base64');

    const html = fs.readFileSync(target, 'utf8')
      .replace(/<script(?![^>]*\bsrc=)/g, '<script nonce="' + nonce + '"')
      .replace('</head>',
        '<script nonce="' + nonce + '">window.ALLY_API_BASE = "/api";</script>\n</head>');

    const buffer = Buffer.from(html, 'utf8');
    res.writeHead(200, {
      'content-type': type,
      'content-length': buffer.length,
      ...securityHeaders(nonce),
      'cache-control': 'no-cache'
    });
    res.end(req.method === 'HEAD' ? undefined : buffer);
    return true;
  }

  res.writeHead(200, {
    'content-type': type,
    'content-length': stat.size,
    'x-content-type-options': 'nosniff',
    /* La maquette évolue à chaque rechargement pendant le développement :
       on ne veut pas se battre contre le cache du navigateur. */
    'cache-control': 'no-cache'
  });

  if (req.method === 'HEAD') { res.end(); return true; }
  fs.createReadStream(target).pipe(res);
  return true;
}

module.exports = { serve, ROOT };
