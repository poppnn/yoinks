# Contribuer à yoinks

[English](CONTRIBUTING.md) · **Français**

Merci de votre aide. yoinks veut rester simple : **coller, récupérer, c'est
fait.** Avant de vous lancer dans une fonctionnalité, consultez
[ROADMAP.fr.md](ROADMAP.fr.md) ou ouvrez une issue, pour qu'on se mette
d'accord sur l'approche.

## Mise en place

Il faut Node.js 22 ou plus récent.

```sh
npm ci
npm run build
node bin/yoinks.js <lien>
```

`npm run dev` reconstruit à chaque modification. `npm link` installe votre
copie de travail comme commande globale `yoinks`.

## Avant d'ouvrir une pull request

Lancez les mêmes vérifications que la CI :

```sh
npm run typecheck
npm test
npm run build
```

Les tests sont à côté du code qu'ils couvrent (`src/**/*.test.ts`) et
tournent avec le lanceur de tests intégré à Node, via `tsx`. Un correctif
doit être accompagné d'un test qui échoue sans lui, chaque fois que le code
peut être testé sans terminal.

## Pull requests

- **Un sujet par pull request.** Les petites PR sont relues et fusionnées
  vite ; une PR qui touche à beaucoup de choses sans rapport devra être
  découpée.
- **Un commit par changement logique**, avec un message qui dit ce qu'il
  corrige ou ajoute (`fix: …`, `feat: …`, `docs: …`, `ci: …`). Les
  messages de commit sont en anglais.
- Ajoutez une ligne sous `## [Unreleased]` dans [CHANGELOG.md](CHANGELOG.md)
  pour tout ce qu'un utilisateur remarquerait.
- Expliquez comment vous avez vérifié le changement, en particulier sur les
  systèmes où vous avez pu tester (Windows, macOS, Linux).

## Options de yt-dlp

yoinks pilote yt-dlp et lit sa sortie pour suivre la progression. Les
options qui modifient cette sortie (`--quiet`, `--print`, `-o`, les modèles
de progression) peuvent casser sans bruit la barre de progression ou le
chemin du fichier final : les arguments de `src/lib/ytdlp.ts` demandent
donc une attention particulière.

**N'activez jamais par défaut une option qui peut échouer sur certaines
machines.** Par exemple, `--cookies-from-browser` fait échouer tous les
téléchargements quand la lecture des cookies échoue, vidéos publiques
comprises : cette option doit rester à activer explicitement.

## Signaler un bug

Indiquez :

- la sortie de `yoinks --version`, et celle de `yoinks --update` (elle
  donne la version de yt-dlp utilisée par yoinks) ;
- votre système et votre terminal ;
- le lien (s'il est public) et le message d'erreur exact.

Beaucoup d'échecs de téléchargement viennent d'un yt-dlp périmé : lancez
d'abord `yoinks --update`.
