/* Ally — service des fichiers du front.

   Le serveur sert aussi la maquette, pour qu'une seule commande fasse tourner
   l'ensemble : `node server/index.js` puis http://localhost:8787.

   En production, ces fichiers seront servis par l'hébergeur ou un CDN, pas par
   l'API. Ce module reste néanmoins écrit sérieusement : un service de fichiers
   naïf est l'un des moyens les plus simples de laisser lire /etc/passwd. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

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

function serve(req, res, pathname) {
  /* On refuse tout ce qui n'est pas une lecture. */
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;

  const clean = decodeURIComponent(pathname.split('?')[0]);
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
    const html = fs.readFileSync(target, 'utf8')
      .replace('</head>', '<script>window.ALLY_API_BASE = "/api";</script>\n</head>');
    const buffer = Buffer.from(html, 'utf8');
    res.writeHead(200, {
      'content-type': type,
      'content-length': buffer.length,
      'x-content-type-options': 'nosniff',
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
