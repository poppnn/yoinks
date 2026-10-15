# yoinks

[English](README.md) · **Français**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
  <img src="assets/logo-light.svg" alt="yoinks" width="288">
</picture>

Récupérez n'importe quelle vidéo. Collez. Récupérez. C'est fait.

Téléchargez des vidéos depuis YouTube, X/Twitter, Instagram, Threads, TikTok
et plus de 1 800 autres sites, directement depuis votre terminal. Collez un
lien, choisissez une résolution (ou seulement l'audio en mp3), et c'est
terminé. Pas de fenêtres surgissantes, pas de faux boutons de
téléchargement, pas de redirections douteuses.

<img src="assets/home.png" alt="écran d'accueil de yoinks — collez un lien et appuyez sur yoink" width="100%">

## Installation

```sh
npm install -g yoinks-cli
```

Ou essayez-le sans rien installer :

```sh
npx yoinks-cli
```

Dans les deux cas, la commande s'appelle `yoinks`. Il faut Node 22 ou plus
récent. Tout le reste (yt-dlp, ffmpeg) est téléchargé ou fourni
automatiquement.

> **yoinks-cli** est la suite maintenue de
> [pablostanley/yoinks](https://github.com/pablostanley/yoinks), dont le
> paquet npm `yoinks` s'est arrêté à la version 0.3.1. Les deux installent
> une commande `yoinks` : désinstallez d'abord l'ancien avec
> `npm uninstall -g yoinks`.

## Utilisation

```sh
$ yoinks https://youtu.be/dQw4w9WgXcQ    # directement au choix du format
$ yoinks                                 # demande un lien
$ yoinks <lien de playlist>              # cochez les éléments voulus
$ yoinks -o ~/Videos <lien>              # enregistre dans le dossier de votre choix
$ yoinks --mp3 <lien>                    # sans interface : pour les scripts
$ yoinks --help                          # tout le reste
```

Sous Windows, le dossier que l'Explorateur affiche « Vidéos » s'appelle en
réalité `Videos` : `-o ~/Vidéos` créerait un nouveau dossier à côté.

yoinks occupe tout le terminal (plein écran, centré, et rend votre
historique intact en sortant). Choisissez un format avec ↑/↓ (ou j/k, ou
les touches numériques) puis Entrée. `esc` revient en arrière, `^c`
quitte. Vous pouvez aussi utiliser la souris : le bouton yoink, la liste des
formats et les raccourcis en bas d'écran sont cliquables, et un clic sur le
logo ramène à l'accueil.

Les fichiers sont enregistrés dans votre dossier Téléchargements (celui de
votre système, même si vous l'avez déplacé) ou dans le dossier de votre
choix avec `-o <dossier>`. Ils portent le titre de la vidéo, ou le nom
donné avec `-n <nom>`. Le chemin du fichier s'affiche dans votre terminal
à la fin. Une fois le fichier enregistré, `o` ouvre son dossier et `c`
copie le fichier lui-même, prêt à être collé dans une discussion ou un
autre dossier.

Les vidéos arrivent en H.264 avec un son AAC quand le site le propose :
c'est lisible partout, QuickTime compris. Au-delà de 1080p, YouTube ne
propose que de l'AV1 ou du VP9, et le menu l'indique
(`2160p · mp4 · AV1`). Les mp3 reçoivent les tags artiste et titre, avec la
miniature comme pochette ; les vidéos gardent leurs chapitres.

Le thème par défaut, `auto`, reprend les couleurs de premier plan et de
fond de votre terminal : il suit donc les thèmes clairs et sombres sans
avoir à deviner. `^t`, ou un clic sur le réglage du thème en bas d'écran,
fait défiler `auto`, `light` et `dark` pour la session en cours. Utilisez
`--theme auto`, `--theme light` ou `--theme dark` pour choisir le thème
de départ d'un lancement.

<img src="assets/download-options.png" alt="choix du format dans yoinks — résolutions avec taille estimée, plus l'audio seul en mp3" width="100%">

### Accessibilité

- `--plain` garde tout dans l'historique normal du terminal, à sa hauteur
  naturelle, sans souris ni animation : c'est le mode à utiliser avec un
  lecteur d'écran. Il s'active aussi tout seul quand `TERM=dumb`.
- `--no-mouse` laisse la sélection de texte à votre terminal.
- `--no-motion` fige le logo.
- Le thème par défaut `auto` n'affiche aucune couleur, seulement du gras,
  de l'atténué et de l'inverse : il respecte donc déjà `NO_COLOR`.

Chacune de ces options a son réglage dans la configuration, pour ne les
indiquer qu'une fois.

## Playlists

Collez le lien d'une playlist (une playlist YouTube, les vidéos d'une
chaîne, un album) et yoinks en liste les éléments, tous cochés :

- `↑`/`↓` pour se déplacer, `espace` pour cocher ou décocher, `a` pour
  tout cocher ou tout décocher, `↵` pour continuer ;
- puis choisissez un format : jusqu'à 1080p, 720p ou 360p, ou mp3 ;
- les éléments se téléchargent l'un après l'autre, dans un dossier au nom
  de la playlist (ou `-n <nom>`), numérotés pour garder leur ordre :
  `03 - Titre.mp3`.

Si un élément échoue (une vidéo privée, par exemple), les autres
continuent, et l'écran final liste ceux qui n'ont pas pu être récupérés.
Le lien d'une vidéo située dans une playlist (`watch?v=…&list=…`) reste
cette seule vidéo.

## Scripts

`--best` (la meilleure qualité vidéo) ou `--mp3` (l'audio seul) sautent le
choix du format et l'interface : la progression s'affiche sur stderr, et
le chemin du fichier enregistré est la seule chose écrite sur stdout.

```sh
f=$(yoinks --mp3 -n "ma chanson" https://youtu.be/dQw4w9WgXcQ) && echo "récupéré : $f"
```

Pour une playlist, `--best` signifie « jusqu'à 1080p », chaque chemin
s'affiche dès que son fichier est enregistré, un par ligne, et `--items`
choisit les éléments par leur numéro dans la playlist :

```sh
yoinks --mp3 --items 1-3,7,10- <lien de playlist>
```

Le code de sortie vaut 0 quand tout est enregistré, 1 en cas d'échec (d'un
élément quelconque, pour une playlist) et 130 si vous appuyez sur ^c. Quand
stdout n'est pas un terminal (un tube, un script), yoinks fonctionne ainsi
de lui-même, avec `--best` sauf si vous passez `--mp3`.

## Configuration

Les réglages que vous indiqueriez à chaque fois vont dans
`~/.config/yoinks/config.json` (au même endroit sur tous les systèmes) :

```json
{
  "output": "~/Videos",
  "cookies": "~/cookies.txt",
  "theme": "dark",
  "format": "mp3"
}
```

| Réglage | Équivaut à | Remarques |
|---|---|---|
| `output` | `-o` | un chemin relatif part du dossier du fichier de configuration |
| `cookies` | `--cookies` | |
| `cookiesFromBrowser` | `--cookies-from-browser` | pas en même temps que `cookies` |
| `theme` | `--theme` | `auto`, `light` ou `dark` |
| `format` | — | `best` ou `mp3` : présélectionné dans le menu, et utilisé quand le menu est sauté |
| `plain` | `--plain` | `true` ou `false` |
| `mouse` | `--no-mouse` | `false` la désactive |
| `motion` | `--no-motion` | `false` la désactive |

Les options de la ligne de commande l'emportent sur le fichier. Un réglage
inconnu provoque une erreur au lieu d'être ignoré en silence, pour qu'une
faute de frappe ne passe pas inaperçue.

## Passer des options à yt-dlp

Tout ce qui suit `--` est transmis tel quel à yt-dlp :

```sh
yoinks <lien> -- --proxy socks5://127.0.0.1:9050
yoinks <lien> -- --write-auto-subs --embed-subs --sub-langs fr
```

Les fichiers que yt-dlp écrit à côté du téléchargement (sous-titres,
miniatures…) sont conservés avec lui. Les options qui casseraient yoinks
sont refusées, avec ce qu'il faut utiliser à la place : les chemins de
sortie, le format (c'est le menu qui le choisit), la sélection dans une
playlist (utilisez `--items`), et tout ce qui modifie la sortie que yoinks
lit pour suivre la progression.

## Se connecter

Certaines vidéos demandent un compte : celles réservées aux adultes, celles
réservées aux membres, beaucoup de publications Instagram. yoinks ne se
connecte jamais de lui-même : transmettez votre connexion sous forme de
cookies, pour ce lancement-là :

```sh
yoinks --cookies ~/cookies.txt <lien>           # un cookies.txt que vous avez exporté
yoinks --cookies-from-browser firefox <lien>    # lus directement dans un navigateur
```

Si yoinks n'arrive pas à lire les cookies, il continue sans eux et vous
explique pourquoi : les vidéos publiques se téléchargent quand même.

**Sous Windows, préférez `--cookies`.** Chrome, Edge et les autres
navigateurs basés sur Chromium empêchent les autres applications de lire
leurs cookies : `--cookies-from-browser chrome` y échoue donc presque
toujours. Firefox, lui, fonctionne.

**Exporter un cookies.txt qui dure.** YouTube renouvelle sans cesse ses
cookies de session : ceux exportés depuis votre fenêtre habituelle cessent
de fonctionner en quelques heures. Procédez plutôt ainsi :

1. Ouvrez une fenêtre de navigation privée et connectez-vous à YouTube.
2. Ouvrez un nouvel onglet et fermez celui qui a servi à vous connecter.
3. Exportez les cookies avec une extension « cookies.txt », de préférence
   open source et fonctionnant hors ligne : une extension qui peut lire des
   cookies peut lire toutes vos sessions.
4. Fermez la fenêtre privée. **Ne vous déconnectez pas** : cela
   invaliderait les cookies que vous venez d'exporter.

Un cookies.txt vaut votre mot de passe : ne le partagez pas et ne le
versionnez pas.

## Fonctionnement

- yoinks s'appuie sur [yt-dlp](https://github.com/yt-dlp/yt-dlp). Au
  premier lancement, il télécharge le binaire autonome de yt-dlp dans
  `~/.yoinks/bin` (sans besoin de Python) et vérifie son SHA-256 auprès
  de la version publiée.
- Les sites changent sans arrêt, et un yt-dlp périmé est la première cause
  d'échec d'un téléchargement : yoinks cherche donc une nouvelle version de
  yt-dlp une fois par jour et met sa copie à jour. `yoinks --update` le
  fait immédiatement.
- Pour utiliser votre propre yt-dlp, indiquez son nom ou son chemin dans
  `YOINKS_YT_DLP`. Le yt-dlp de votre système sert aussi de solution de
  repli quand yoinks ne peut pas obtenir sa propre copie, par exemple hors
  ligne au premier lancement, ou sous Termux.
- ffmpeg (nécessaire pour assembler les flux haute résolution, extraire
  les mp3 et intégrer les tags) est cherché dans votre PATH, avec
  `ffmpeg-static` en solution de repli fournie avec yoinks.
- L'interface est faite avec [Ink](https://github.com/vadimdemedes/ink),
  React pour le terminal.

## Développement

```sh
npm ci
npm run build        # assemble dist/ avec tsup
npm run dev          # reconstruit à chaque modification
node bin/yoinks.js <lien>
npm run typecheck
npm test
```

Pour l'essayer comme commande globale sans le publier : `npm link`, puis
lancez `yoinks` n'importe où. Lisez [CONTRIBUTING.fr.md](CONTRIBUTING.fr.md)
avant de proposer une pull request.

## Feuille de route

Voir [ROADMAP.fr.md](ROADMAP.fr.md) et le [journal des modifications](CHANGELOG.md)
(en anglais).

## Remerciements

yoinks a été créé par [Pablo Stanley](https://github.com/pablostanley).
Cette suite reprend des correctifs et des idées proposés par la communauté
sur le projet d'origine : merci à @agammann, @g9i, @lennin331, @aliabedi1,
@SuperProCoolName, @EmekC, @juan-multi-7575 et @Mr-Neutr0n.

## Usage responsable

yoinks est un outil d'archivage personnel. Télécharger un contenu peut
enfreindre les conditions d'utilisation d'une plateforme : ne téléchargez
que ce que vous avez le droit de conserver, et respectez les créateurs.

## Licence

[MIT](LICENSE)
