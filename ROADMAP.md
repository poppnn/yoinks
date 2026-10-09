# yoinks — Roadmap de reprise

> État au 9 octobre 2026 · base : `pablostanley/yoinks@6f03720` (v0.3.1)

## 1. État des lieux

| | |
|---|---|
| Code | ~1 900 lignes TypeScript (Ink + React), 29 commits, licence MIT |
| Audience | 5 577 étoiles, 470 forks |
| En attente | 15 issues + 13 PR ouvertes, **aucune réponse du mainteneur** |
| Activité amont | dernier push le **17/07/2026**, au lendemain de la création du dépôt |
| npm | le nom `yoinks` appartient à `pablostanley` ; dernière publication le 17/07 |
| Qualité | pas de CI, pas de CHANGELOG ; tests limités à `args.ts` et `panel.tsx` |
| Forks | aucun fork n'a repris le flambeau (les plus actifs ont 0 étoile) |

Le projet a trouvé son public, puis a été laissé en l'état. La file de PR montre que des contributeurs ont déjà fait une bonne partie du travail : la reprise consiste d'abord à **trier, fusionner et stabiliser**, beaucoup plus qu'à réécrire.

### Ce que l'auteur avait prévu

La section « Roadmap » du README d'origine est reprise ici, pour qu'il n'existe plus qu'une seule source :

| Point du README | Statut | Où ici |
|---|---|---|
| Mode scriptable `--best` / `--mp3` (sans menu) | à faire | Phase 2 |
| `-o <dir>` | à faire | Phase 2 |
| Playlists, fils contenant plusieurs vidéos | à faire | Phase 5 |
| Détection du presse-papiers au lancement | **déjà fait** (`cli.tsx:56-62`, proposé avec ⇥) | — |
| Mise à jour automatique de yt-dlp | à faire | Phase 1 (R1) |
| Publication npm | fait | — |
| Installeur `curl yoinks.sh \| sh` | à décider | §5 |

## 2. Diagnostic : causes racines

Chaque point a été vérifié dans le code source. Les issues se regroupent presque toutes sous ces neuf causes.

| # | Cause racine | Où | Symptômes |
|---|---|---|---|
| R1 | **yt-dlp jamais mis à jour.** `ensureYtDlp` prend n'importe quel yt-dlp système, même ancien, et ne met jamais à jour la copie qu'il télécharge lui-même. | `ytdlp.ts:39-59` | #8 (l'issue la plus commentée : « ça marche après `yt-dlp --update` »), 403 YouTube (#17), probablement #24 |
| R2 | **Binaire exécuté sans vérification.** Le `yt-dlp.exe` téléchargé n'est pas contrôlé, alors que yt-dlp publie un fichier `SHA2-256SUMS`. | `ytdlp.ts:48-57` | Risque de chaîne d'approvisionnement |
| R3 | **Version de Node fausse.** `engines` annonce `>=18`, mais `ink@7` exige `>=22` (vérifié dans les dépendances installées). Sous Node 18/20, plantage au démarrage. | `package.json` | #37 |
| R4 | **Mauvais fichier livré.** yt-dlp n'écrase jamais un fichier existant : avec un nom déjà pris, il saute le téléchargement et yoinks annonce « yoinked! » en pointant l'ancien fichier. | `ytdlp.ts:246-247` | #40 |
| R5 | **Codecs non contraints.** `--merge-output-format mp4` sans préférence de codec donne de l'AV1/Opus dans un `.mp4`, illisible par QuickTime et par beaucoup de lecteurs. `scoreVideo` ne joue que sur l'étiquette affichée, pas sur le sélecteur `-f`. | `ytdlp.ts:160-168, 190` | #32, #33, #40 |
| R6 | **Aucune option yt-dlp transmissible.** Les arguments sont codés en dur et `parseArgs` rejette tout le reste. | `args.ts`, `ytdlp.ts:231` | #11 (cookies), #3 (chapitres), #12 (métadonnées) |
| R7 | **Dossier de sortie codé en dur.** `homedir()/Downloads` ignore les dossiers déplacés sous Windows et `XDG_DOWNLOAD_DIR` sous Linux. | `app.tsx:31` | #22, #34 |
| R8 | **Ctrl+V avalé.** La branche `if (key.ctrl)` retourne sans rien faire pour `v`. Dans les consoles qui transmettent `^V` brut au lieu de coller, le collage est impossible. | `text-input.tsx:140-150` | #29 |
| R9 | **Fichiers temporaires jamais supprimés.** Chaque analyse écrit un `yoinks-info-*.json` dans le dossier temporaire, qui n'est jamais effacé. | `ytdlp.ts:130-131` | signalé dans #23 |

## 3. Phases

Effort estimé : **S** = moins d'une demi-journée · **M** = 1 à 2 jours · **L** = plus.

### Phase 0 — Fondations · avant toute fonctionnalité

| Tâche | Effort | Réf. |
|---|---|---|
| Choisir le nom de publication (voir §5) et forker | S | — |
| Ouvrir une issue amont pour proposer une co-maintenance, ou obtenir l'accord pour un fork « officiel » | S | — |
| CI GitHub Actions : typecheck, tests, build sur ubuntu/macos/windows × Node 22/24 | S | — |
| Corriger `engines` à `>=22` avec un garde-fou au lancement | S | PR #37 |
| Ajouter `CHANGELOG.md` et `CONTRIBUTING.md` (une PR = un sujet) | S | — |
| Vérifier que la suite de tests passe sur `main` (PR #17 y signale un test de thème en échec, non vérifié ici) | S | — |

### Phase 1 — Fiabilité · v0.4 « ça marche »

L'objectif est de faire disparaître les échecs en premier : c'est ce que vivent la plupart des utilisateurs.

| Tâche | Effort | Réf. | État |
|---|---|---|---|
| **Cycle de vie de yt-dlp** : la copie gérée par yoinks passe en premier, vérifiée au plus une fois par jour. `YOINKS_YT_DLP` permet d'imposer un autre binaire, et le yt-dlp système sert de repli. Commande `yoinks --update`. | M | R1, #8 | ✅ |
| Vérifier le SHA-256 du binaire contre `SHA2-256SUMS` avant de l'exécuter | S | R2 | ✅ |
| Un dossier de téléchargement isolé par tâche, pour ne jamais livrer un ancien fichier | S | R4, PR #40 | ✅ repris de #40 |
| Blocage à la fermeture | S | PR #40 | ✅ repris de #40 |
| Suppression des fichiers partiels à l'annulation | S | PR #18 | ✅ couvert par le dossier isolé de #40 |
| Supprimer le `yoinks-info-*.json` après usage, et à la sortie | S | R9 | ✅ repris de #40 |
| Ctrl+V : lire le presse-papiers et insérer son contenu | S | R8, #29 | ✅ |
| Messages d'erreur exploitables : compte requis, yt-dlp probablement périmé | S | — | ✅ |
| *En plus, repris de #40 :* invite du shell qui écrasait « yoinked → », lien conservé après « réessayer », champ trop large sous 72 colonnes | S | PR #40 | ✅ |

Deux écarts avec le plan initial, appris en le réalisant :

- **Pas d'avertissement basé sur l'âge de yt-dlp.** Un yt-dlp de 50 jours peut très bien être la dernière version : il n'y a parfois aucune release pendant des semaines. On compare donc le hash avec la dernière release, sans regarder la date.
- **Une vérification ratée compte comme faite.** Sinon, un réseau qui bloque GitHub sans répondre ferait attendre 10 secondes à chaque lancement.

### Phase 2 — Contrôle utilisateur · v0.5

| Tâche | Effort | Réf. | État |
|---|---|---|---|
| Mode scriptable : `--best` / `--mp3` sautent le menu, sortie non interactive si stdout n'est pas un TTY | M | README d'origine | ✅ |
| Option `-o, --output <dossier>` | S | #34, PR #35 | ✅ repris de #35, avec son test rendu portable sous Windows |
| Dossier par défaut = le vrai dossier Téléchargements : Known Folder sous Windows, `XDG_DOWNLOAD_DIR` sous Linux | S | R7, #22 | ✅ |
| Fichier de configuration `~/.config/yoinks/config.json` : dossier, format par défaut, cookies, thème | M | — | ✅ |
| **Cookies, uniquement sur option** : `--cookies <fichier>` et `--cookies-from-browser <navigateur>`, ou via la config | M | R6, #11 | ✅ avec repli sans cookies |
| Nom de fichier personnalisé : `-n, --name` | S | #6, PR #7 | ✅ validation reprise de #7 · ⏳ touche `s` dans le sélecteur non reprise |
| Ouvrir le dossier après téléchargement (touche `o`) | S | PR #23 | ✅ sans le délai qui tuait le gestionnaire de fichiers |
| `--concurrent-fragments 4` | S | PR #23 | ✅ |

Ce que la réalisation a ajouté ou corrigé par rapport au plan :

- **Le « format » de la config présélectionne un choix ; il ne saute pas le sélecteur.** Sinon, lancer `yoinks` sans lien deviendrait impossible. Il ne sert à sauter le sélecteur que là où celui-ci est déjà sauté, dans un pipe.
- **Le test de #35 échouait sous Windows**, ce que personne n'avait vu en amont faute de CI.
- **Constaté pendant les tests** : la vidéo « best » sort en AV1/Opus dans un `.mp4`. Le point R5 de la phase 3 est donc bien réel.

> **À retenir sur les cookies.** Sous Windows, `--cookies-from-browser chrome` échoue avec Chrome 127+ (« Failed to decrypt with DPAPI », yt-dlp #10927, à cause de l'App-Bound Encryption), et Edge est concerné aussi. Un échec d'extraction est **fatal pour tous les téléchargements**, y compris les vidéos publiques. Il faut donc :
> - laisser les cookies en option, jamais par défaut ;
> - en cas d'échec d'extraction, réessayer sans cookies pour les contenus publics ;
> - documenter l'export `cookies.txt` (navigation privée, puis fermer la fenêtre sans se déconnecter) et la voie Firefox.

### Phase 3 — Formats · v0.6

| Tâche | Effort | Réf. |
|---|---|---|
| Vidéos compatibles partout : préférer H.264/AAC via le tri natif de yt-dlp (`-S res:<h>,vcodec:h264,acodec:m4a`) plutôt que des filtres écrits à la main. Afficher le codec dans le menu. | M | R5, #32 |
| MP3 : métadonnées ID3 et pochette (`--embed-metadata --embed-thumbnail`) | S | #12 |
| Chapitres intégrés (`--embed-chapters`) | S | #3, PR #4 |

### Phase 4 — Accessibilité et confort · v0.7

| Tâche | Effort | Réf. |
|---|---|---|
| `--no-mouse`, `--plain` (sans écran alternatif), `--no-motion`, respect de `NO_COLOR` | M | PR #31 (à découper) |
| Saisie lisible par les lecteurs d'écran (spans contigus) | S | PR #31 |
| Copier le chemin du fichier dans le presse-papiers | S | PR #2 |
| Option de secours pour passer des arguments bruts à yt-dlp (`yoinks <url> -- --opt`), avec une liste d'options interdites qui casseraient l'analyse de la progression (`--quiet`, `-o`, `--print`…) | M | R6 |

### Phase 5 — Playlists · v0.8

| Tâche | Effort | Réf. |
|---|---|---|
| Playlists et fils contenant plusieurs vidéos : sélection des éléments, progression globale. Il faut retirer `--no-playlist` et revoir l'analyse de la progression, qui suppose aujourd'hui un seul élément. | L | README d'origine |

### Plus tard, ou pas

| Demande | Décision | Raison |
|---|---|---|
| Réécriture en Rust (#38) | **Non** | Aucun gain utilisateur, et tout le travail des PR serait perdu |
| Docker (#10) | **Non** | Une interface de terminal dans un conteneur n'a guère de sens ; utiliser yt-dlp directement |
| Termux / Android (#39) | **Documenter** | Fonctionne si `pkg install yt-dlp ffmpeg nodejs`, puisque le yt-dlp système est essayé en premier. Ajouter un garde-fou : `process.platform === 'android'` télécharge aujourd'hui un binaire Linux glibc qui ne peut pas tourner. |
| Multilingue (#16, PR #16) | **Reporté** | Coût d'architecture élevé tant que l'interface bouge encore |
| Scripts d'installation (PR #9) | **À décider** (§5) | Prévu par l'auteur d'origine. Reste à trancher : publier un `curl \| sh` impose de signer et de vérifier ce qu'il télécharge. |
| #24, #26, #36 | **Demander des détails** | Trop peu d'informations ; #24 relève probablement de R1 |

## 4. Tri des PR ouvertes

Chaque PR se fusionne seule sans conflit avec `main`, mais **elles se chevauchent entre elles** : `app.tsx` est modifié par #40, #31, #23, #35, #33 et #16. L'ordre de fusion compte donc.

| Ordre | PR | Décision | Raison |
|---|---|---|---|
| 1 | #37 garde-fou Node | **Fusionner** | Corrige R3, petite, isolée |
| 2 | #40 mauvais fichier, blocage, QuickTime | **6 commits sur 8 repris** (phase 1) | La PR contient 8 commits, pas 3. Les 2 derniers (préférence QuickTime, taille réelle par résolution) attendent la phase 3, à comparer avec #33. |
| 3 | #18 nettoyage à l'annulation | **Rendue inutile** | Le dossier isolé de #40 supprime tous les fichiers partiels et reprend l'attente de fin de yt-dlp que #18 avait identifiée. Créditée dans le CHANGELOG. |
| 4 | #35 option `-o` | **Fusionner, puis adapter** | Rebrancher sur la config et le Known Folder (phase 2) |
| 5 | #7 nom de fichier | **Fusionner après #40** | Touche aussi le chemin de sortie |
| 6 | #33 QuickTime H.264/AAC | **Comparer avec #40** | Les deux résolvent R5 ; n'en garder qu'une, de préférence avec le tri `-S` |
| 7 | #2 copier dans le presse-papiers | **Fusionner** | Petite |
| — | #23 QoL | **Reprendre en partie** | Garder `--concurrent-fragments`, le nettoyage des fichiers temporaires et la touche `o`. **Refuser** `--cookies-from-browser firefox` codé en dur : fatal pour quiconque n'a pas Firefox. |
| — | #31 accessibilité | **Demander un découpage** | 432 lignes sur 19 fichiers, impossible à relire d'un bloc et en conflit avec tout le reste |
| — | #17 repli mweb sur 403 | **En attente** | Fixer un `player_client` vieillit mal ; réévaluer une fois R1 corrigé, car un yt-dlp à jour rend souvent ce contournement inutile |
| — | #4 chapitres | **Relire** | Recoupe la phase 3 |
| — | #16 multilingue | **Reporter** | Voir plus haut |
| — | #9 scripts d'installation | **En attente** | Dépend de la décision du §5 |

## 5. Décisions à prendre

1. **Le nom npm.** `yoinks` appartient à `pablostanley`, donc un fork ne peut pas publier sous ce nom. Trois options :
   - (a) obtenir les droits de publication auprès de Pablo — idéal, puisque les 5 577 étoiles et les installations existantes suivraient ;
   - (b) un nom scopé, comme `@poppnn/yoinks` ;
   - (c) un nouveau nom.

   Tenter (a) d'abord, avec (b) comme repli.
2. **Le fork reste-t-il compatible avec l'amont ?** Si Pablo revient, il faut pouvoir lui reverser les correctifs. Pour cela : des PR petites et un historique propre.
3. **L'installeur `curl | sh`.** L'auteur d'origine le voulait. Il faciliterait l'installation pour les gens qui n'ont pas Node, mais il ajoute une surface de sécurité (script servi depuis un domaine, binaire à vérifier). Une alternative sans script : des binaires autonomes via `node --experimental-sea` ou bun, publiés en release GitHub avec leurs sommes de contrôle.
4. **Le périmètre.** yoinks doit rester « coller, récupérer, terminé ». Chaque option ajoutée doit avoir une valeur par défaut raisonnable : l'interface ne doit pas devenir un front-end exhaustif de yt-dlp.
