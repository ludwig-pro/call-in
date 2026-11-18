# Instance Call-in BordeauxJS

L’instance [call-in.bordeauxjs.com](https://call-in.bordeauxjs.com/) est déployée depuis le fork [ludwig-pro/call-in](https://github.com/ludwig-pro/call-in). Elle utilise le Worker `call-in`, son propre Durable Object SQLite `LiveSession` et le domaine personnalisé `call-in.bordeauxjs.com`. L’adresse workers.dev reste active.

L’interface de cette installation est en français. Les nouveaux événements reçoivent des libellés français. Pour les anciens événements, les libellés par défaut sont traduits à l’affichage, sans modifier les données enregistrées ni les textes personnalisés.

Un titre suffit pour créer un événement ; une présentation reste facultative. Les participants posent leurs questions avec un pseudo et peuvent soutenir celles des autres, sans compte. Les organisateurs consultent les questions en direct et les gèrent depuis leur lien de modération privé.

## Configuration

Les événements créés sur le site disposent chacun de leurs liens privés de configuration et de modération. Aucun secret global n’est nécessaire pour ce parcours. Les données, réponses et PDF expirent après sept jours ; la taille maximale d’un PDF est de 20 Mo. La démo est publique et se réinitialise chaque jour.

Le fichier local `wrangler.selfhost.jsonc` contient la configuration de l’instance, notamment le nom du Worker, son compte et son domaine. Il est ignoré par Git. `wrangler.selfhost.example.jsonc` en fournit un modèle sans identifiant de compte. Avant un premier déploiement depuis une autre copie, vérifier le compte et les ressources existantes ; ne jamais réutiliser un nom ou un domaine appartenant à un autre service.

`ROOM_ID` reste à `default` et `ALLOWED_ORIGINS` est vide. Les condensats administrateur et modérateur vides concernent l’ancien mode à événement unique ; ils ne sont pas nécessaires aux événements créés sur le site.

`prepare-selfhost.mjs` produit `.selfhost-assets` à partir de `public` : il active le français et adapte les liens au domaine de l’instance. Ce dossier est généré et ignoré par Git. La police Archivo est servie par le Worker depuis `public/brand/`, avec sa licence.

## Protection de la création publique

Le binding Wrangler `CREATE_ATTEMPTS` limite chaque adresse IP à quatre tentatives de création par minute et par point de présence Cloudflare. Les plafonds globaux restent de six créations par minute, cent par jour et 400 Mio de PDF par jour. Les questions et les votes ont leurs propres limites.

Pour activer Turnstile, créez un widget géré pour les hôtes autorisés à créer des événements. Enregistrez sa clé publique et sa clé secrète comme secrets du Worker, par exemple avec `npx wrangler secret bulk --config wrangler.selfhost.jsonc` et un objet JSON sur l’entrée standard contenant `TURNSTILE_SITE_KEY` et `TURNSTILE_SECRET_KEY`. Le formulaire charge le widget au moment de la création. Le Worker vérifie le jeton transmis dans l’en-tête `X-Turnstile-Token`, le nom d’hôte et l’action `create_event` avant de lire le corps. Réglez `TURNSTILE_REQUIRED` sur `"true"` dans les variables Wrangler de production, comme sur BordeauxJS. Si une clé manque, la création échoue. Pour un développement local sans widget, omettez les deux clés et laissez `TURNSTILE_REQUIRED` sur `"false"`.

Les PDF importés sont limités à 20 Mio et contrôlés à leurs deux extrémités. Le lecteur utilise une origine opaque, y compris en accès direct. L’URL du fichier brut déclenche un téléchargement. Ces contrôles ne constituent pas une analyse antivirus. Seules les URL d’intégration Google Slides reconnues sont chargées automatiquement. Les autres liens nécessitent un clic sur le domaine affiché.

## Mettre à jour l’instance

Dans la copie locale, `origin` désigne le fork et `upstream` le projet d’origine. Pour intégrer une nouvelle version du projet d’origine :

```sh
git fetch upstream
call_in_previous=$(git rev-parse HEAD)
git merge upstream/main
git diff "$call_in_previous" HEAD -- wrangler.jsonc
```

Résoudre les éventuels conflits et examiner les changements de configuration. Reporter les changements nécessaires dans `wrangler.selfhost.jsonc` en conservant le nom `call-in`, le bon compte, le domaine, `.selfhost-assets` et l’historique des migrations Durable Object. Ne pas recopier l’environnement `production` de l’auteur ni ses routes. Examiner attentivement toute migration qui supprime, transfère ou renomme une classe.

```sh
npm ci
npm run check
npm run vendor:pdfjs
node prepare-selfhost.mjs
npx wrangler deploy --dry-run --config wrangler.selfhost.jsonc
git push origin main
npx wrangler deploy --config wrangler.selfhost.jsonc
```

Le script de préparation s’arrête si les textes amont qu’il adapte ont changé : examiner ces changements et ajuster le script avant de déployer. Après déploiement, vérifier le site et le parcours de création. Toujours préciser `--config wrangler.selfhost.jsonc` ; les commandes de déploiement amont ciblent une autre configuration.
