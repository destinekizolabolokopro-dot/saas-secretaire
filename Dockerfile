# Ally — image de production.
#
# Aucune dépendance à installer : le serveur n'utilise que la bibliothèque
# standard de Node. L'image se résume donc au runtime et au code.

FROM node:22-alpine

# Un utilisateur non privilégié : l'image node en fournit un, « node ».
# Un serveur qui tourne en root n'a aucune raison de le faire, et toutes les
# raisons de ne pas le faire.
WORKDIR /app

COPY package.json ./
COPY server ./server
COPY css ./css
COPY js ./js
COPY fonts ./fonts
COPY *.html favicon.svg ./

# Les données vivent sur un volume : sans lui, chaque redéploiement repart
# d'une base vide — comptes compris.
RUN mkdir -p /var/lib/ally && chown -R node:node /var/lib/ally /app
VOLUME /var/lib/ally
ENV ALLY_DATA_DIR=/var/lib/ally
ENV NODE_ENV=production
ENV PORT=8787

USER node
EXPOSE 8787

# Le serveur refuse de démarrer si la configuration rendrait le produit
# malhonnête — par exemple un parcours d'inscription dont le code ne part
# nulle part. L'échec au démarrage vaut mieux que des comptes mort-nés.
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
