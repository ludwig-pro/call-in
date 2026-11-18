# Call-in pour BordeauxJS

Call-in permet au public d’un meetup de poser des questions en direct et de soutenir celles qu’il aimerait voir abordées. Ce dépôt est le fork BordeauxJS de [Call-in, créé par Mashbean](https://github.com/mashbean/call-in). Il adapte le parcours à nos meetups, avec une interface française aux couleurs de BordeauxJS.

[Créer un événement](https://call-in.bordeauxjs.com/#create) · [Essayer la démo](https://call-in.bordeauxjs.com/fr/demo/)

## Pendant un meetup

1. **Créez l’événement.** Donnez-lui un titre. Vous pouvez ajouter un PDF jusqu’à 20 Mo ou coller un lien vers des slides en ligne.
2. **Partagez le QR code.** Les participants rejoignent l’événement depuis leur navigateur. Ils choisissent un pseudo pour poser une question et peuvent soutenir les questions publiées. Aucun compte n’est requis.
3. **Suivez et modérez les questions.** La vue présentateur affiche les questions à côté du PDF ou des slides Google intégrées. Les autres présentations s’ouvrent dans un nouvel onglet, avec leur domaine indiqué. Le mur de questions peut s’ouvrir dans un onglet séparé pour être projeté. Le lien de modération permet notamment de publier ou de masquer une question, de la rétablir et de mettre les nouvelles questions en pause.

Conservez les liens de configuration et de modération obtenus à la création. Partagez le lien public ou le QR code avec les participants et le lien privé de modération avec l’équipe qui en a besoin.

Le lien privé de configuration permet de supprimer l’événement et ses données à tout moment. Les événements expirent automatiquement après sept jours. La démo est publique et se réinitialise chaque jour.

## Développer en local

Le projet nécessite Node.js 22.13 ou une version supérieure, ainsi que npm.

```sh
git clone https://github.com/ludwig-pro/call-in.git
cd call-in
npm ci
npm run dev
```

Ouvrez l’adresse affichée par Wrangler. Les pages françaises sont accessibles à la route `/fr/`.

```sh
npm run check
```

Cette commande vérifie TypeScript, exécute les tests et simule les déploiements Wrangler.

## Auto-hébergement sur Cloudflare

Le service utilise un Worker Cloudflare et des Durable Objects SQLite pour isoler les événements et diffuser les questions en direct. Le [guide d’auto-hébergement](./SELFHOST.md) décrit la configuration française de BordeauxJS, le déploiement et la mise à jour depuis le projet d’origine.

## Licence et crédits

Call-in est distribué sous [licence Apache 2.0](./LICENSE). Les crédits du projet d’origine et des dépendances figurent dans [NOTICE](./NOTICE) et [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
