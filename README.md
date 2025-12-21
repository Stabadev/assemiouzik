Cette appli web est hebergée ici: https://chanter.rogues.fr/

Allez y faire un tour, chantez, et partagez votre score avec vos proches !

# Une application de chant

Chantez, apprenez à rester sur la bonne note, et amusez-vous. Cette application web de style jeu rétro aide les utilisateurs à améliorer leur chant en détectant s'ils chantent juste en suivant une mélodie MIDI. Inspirée par les jeux d'arcade classiques, elle transforme l'éducation musicale en une expérience interactive et amusante.

Destinée aux fans des Verts, mais pas que !

## 🎵 Qu'est-ce qu'chanter.rogues.fr ?

chanter.rogues.fr est une application web de chant qui combine l'éducation musicale avec une esthétique de jeu rétro. Les utilisateurs chantent en suivant une mélodie MIDI, et l'application fournit un retour en temps réel sur leur précision de ton. L'interface présente un style de jeu rétro où la voix de l'utilisateur est représentée par un ballon en mouvement qui suit la bonne note.

L'application est conçue pour :
- Aider les utilisateurs à développer leur précision de ton et leur contrôle vocal
- Rendre l'apprentissage de la musique amusant et accessible
- Créer un environnement ludique où les erreurs font partie du processus d'apprentissage
- Encourager l'auto-correction grâce à des retours visuels (le ballon se déplace vers le haut ou le bas selon que l'utilisateur chante trop haut ou trop bas)

Cette application est idéale pour :
- Tout le monde !!! 
- Les fans des Verts mais pas que !
- Les étudiants en musique qui apprennent à chanter dans l'harmonie
- Les chanteurs qui pratiquent leur précision de ton
- Les familles et groupes qui veulent chanter ensemble
- Les éducateurs qui enseignent la musique de manière ludique et interactive

## 🎯 Pourquoi cela importe ?

Beaucoup de gens pensent qu'ils ne savent pas chanter, mais la vérité est que chanter est une compétence qui peut être apprise. chanter.rogues.fr supprime la peur en :
- Rendre l'éducation musicale **amusante et engageante**
- Fournissant un **retour visuel immédiat** sur la précision de ton
- Créant un **environnement sympa, de type jeu**, où les erreurs font partie du processus d'apprentissage
- Encourageant la **correction auto** grâce à des indices visuels

## 🛠️ Fonctionnalités techniques

chanter.rogues.fr utilise des technologies web modernes pour offrir une expérience de chant fluide et en temps réel. Voici comment cela fonctionne :

### Fonctionnalités principales
- **Web Audio API** : Utilisée pour capturer la voix de l'utilisateur via le microphone et analyser le ton en temps réel.
- **Lecture de mélodie MIDI** : L'application joue une mélodie MIDI en utilisant l'API Web Audio, permettant aux utilisateurs de chanter en suivant la mélodie.
- **Détection de ton** : Un algorithme de détection de ton analyse la voix de l'utilisateur et la compare à la mélodie cible.
- **Retour en temps réel** : L'application fournit un retour visuel immédiat sur la précision de ton, aidant les utilisateurs à rester en harmonie avec la mélodie.

### Composants clés
- **HTML5 Canvas** : Utilisé pour afficher l'interface de style jeu rétro.
- **JavaScript (ES6+)** : Gère la logique principale, y compris le traitement audio, la détection de ton et le rendu du jeu.
- **Web Audio API** : Utilisée pour l'entrée audio (microphone), la lecture et l'analyse du ton.
- **MIDI-Player.js** : Une bibliothèque JavaScript pour jouer et analyser les fichiers MIDI.

### Comment cela fonctionne
1. L'utilisateur sélectionne une mélodie MIDI à chanter: Allez les Verts
2. L'application joue la mélodie et commence à enregistrer la voix de l'utilisateur.
3. L'algorithme de détection de ton analyse la voix de l'utilisateur en temps réel.
4. L'application visualise le ton de l'utilisateur comme un ballon en mouvement sur l'écran.
5. L'utilisateur reçoit un retour immédiat sur sa précision de ton, l'aidant à rester en harmonie avec la mélodie.

### Installation et utilisation
1. Clonez le dépôt : `git clone git@github.com:Stabadev/assemiouzik.git`
2 . Lancez un serveur en local
3. Ouvrez l'application dans un navigateur web et accordez l'accès au microphone.

### Dépendances
- **Web Audio API** : Intégrée dans les navigateurs modernes (Chrome, Firefox, Edge, Safari).
- **MIDI.js** : Pour jouer et analyser les fichiers MIDI.

### Améliorations futures
- Ajouter une fonctionnalité multijoueur pour chanter ensemble avec des amis.
- Ajouter un mode "défi" où les utilisateurs peuvent concurrencer pour chanter dans l'harmonie.
- Ajouter un mode "entrainement" avec des niveaux de difficulté ajustables.
- Intégrer avec des plateformes d'éducation musicale (par exemple, Spotify, YouTube) pour la sélection de chansons.

## 🎮 Démonstration

Consultez la démonstration en direct sur [https://chanter.rogues.fr](https://chanter.rogues.fr) (si déployé) ou exécutez l'application localement.

## 📝 Licence

Ce projet est sous licence MIT. Voir le fichier [LICENSE](LICENSE) pour plus de détails. Tout usage ou adaptation doit citer et créditer les auteurs initiaux, et les prévenir: `gg-overflow` et `Stabadev`

## 🤝 Contribution

Les contributions sont les bienvenues ! Veuillez ouvrir un issue ou soumettre une demande de fusion pour aider à améliorer chanter.rogues.fr


---

**chanter.rogues.fr** – Où l'éducation musicale rencontre le jeu rétro !