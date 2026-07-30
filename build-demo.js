/* Assemble les 4 écrans en un seul fichier HTML autonome, ouvrable par
   double-clic (aucun serveur, aucune ressource externe : CSS, JS et polices
   sont intégrés). Usage : node build-demo.js */
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const b64 = (f) => fs.readFileSync(path.join(__dirname, f)).toString('base64');

/* ---- CSS : les url('../fonts/x.woff2') deviennent des data URIs ---- */
let css = ['css/tokens.css', 'css/base.css', 'css/site.css', 'css/dashboard.css']
  .map(read).join('\n');

css = css.replace(/url\('\.\.\/fonts\/([^']+)'\)/g, (_, file) =>
  "url('data:font/woff2;base64," + b64('fonts/' + file) + "')");

/* ---- Corps de chaque page, sans les balises <script src> ni <link> ---- */
function body(file) {
  const html = read(file);
  const inner = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
  return inner.replace(/\s*<script src="[^"]*"><\/script>/g, '');
}

const SCREENS = [
  ['landing', 'index.html'],
  ['login', 'login.html'],
  ['onboarding', 'onboarding.html'],
  ['dashboard', 'dashboard.html']
];

let screens = SCREENS.map(([id, file]) => {
  let markup = body(file);

  // Les liens entre pages deviennent des changements d'écran.
  markup = markup.replace(/href="(index|login|onboarding|dashboard)\.html"/g,
    (_, target) => 'href="#" data-goto="' + target.replace('index', 'landing') + '"');

  // #greeting existe dans l'onboarding et dans Configuration IA : on désambiguïse.
  if (id === 'onboarding') markup = markup.replace(/"greeting"/g, '"ob-greeting"');

  return '<div class="screen" id="screen-' + id + '"' +
    (id === 'landing' ? ' data-active="true"' : '') + '>' + markup + '</div>';
}).join('\n');

/* ---- JS : mêmes fichiers, navigation redirigée vers le routeur ---- */
let js = ['js/profiles.js', 'js/store.js', 'js/landing.js', 'js/login.js',
          'js/onboarding.js', 'js/dashboard.js'].map(read).join('\n');

js = js
  .replace(/window\.location\.href = ([^;]+);/g, 'window.ALLY_GOTO($1);')
  // #greeting existe côté onboarding (statique) et côté Ally (généré) :
  // l'un devient ob-greeting, l'autre dash-greeting.
  .replace(/getElementById\('greeting'\)/g, "getElementById('ob-greeting')")
  .replace(/querySelector\('#greeting'\)/g, "querySelector('#dash-greeting')")
  .replace(/id="greeting"/g, 'id="dash-greeting"')
  .replace(/for="greeting"/g, 'for="dash-greeting"');

const router = `
/* Routeur d'écrans du fichier de démonstration. */
window.ALLY_GOTO = function (target) {
  var id = String(target).replace(/\\.html$/, '').replace(/^index$/, 'landing');
  var next = document.getElementById('screen-' + id);
  if (!next) return;
  document.querySelectorAll('.screen').forEach(function (s) { s.removeAttribute('data-active'); });
  next.setAttribute('data-active', 'true');
  window.scrollTo(0, 0);
  // Sans rechargement de page, on redemande à l'écran de relire le compte.
  if (id === 'dashboard' && window.ALLY_DASHBOARD_REFRESH) window.ALLY_DASHBOARD_REFRESH();
  if (id === 'onboarding' && window.ALLY_ONBOARDING_REFRESH) window.ALLY_ONBOARDING_REFRESH();
};
document.addEventListener('click', function (event) {
  var link = event.target.closest('[data-goto]');
  if (!link) return;
  event.preventDefault();
  window.ALLY_GOTO(link.getAttribute('data-goto'));
});
/* Pas de pages ici : réinitialiser recharge le fichier. */
window.addEventListener('load', function () {
  window.ALLY_RESTART = function () { window.location.reload(); };
});
`;

const shell = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ally — démonstration</title>
<link rel="icon" href="data:image/svg+xml;base64,${b64('favicon.svg')}" type="image/svg+xml">
<style>
${css}
/* Un seul écran visible à la fois. */
.screen { display: none; }
.screen[data-active] { display: block; }
</style>
</head>
<body>
${screens}
<script>
${router}
${js}
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, 'ally-demo.html'), shell);
console.log('ally-demo.html écrit — ' + Math.round(shell.length / 1024) + ' Ko');
