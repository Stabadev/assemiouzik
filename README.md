# 🎤 ASSE Miouzik — Application web de chant & précision vocale (Foot & Rock Edition)

**ASSE Miouzik** (https://chanter.rogues.fr) est une application web ludique qui entraîne la justesse vocale en transformant une mélodie MIDI en un mini-jeu de chant en temps réel.

📌 **Confidentialité & architecture**

- Tous les traitements audio sont effectués **localement dans le navigateur** de l’utilisateur.
- Les données du microphone sont analysées en mémoire via la **Web Audio API**, mais **aucun enregistrement n’est envoyé**, stocké ou transmis vers un serveur.
- L’application ne nécessite **aucun backend**, aucune API distante, et aucune base de données.
- Le jeu fonctionne entièrement en **client-side** : HTML + JS + Canvas + Web Audio.

👉 Résultat :  
Tu peux jouer, chanter et t’entraîner **sans collecte audio**, même hors connexion si les ressources sont déjà chargées.

---

## 🚀 Fonctionnement général

- Une mélodie MIDI défile horizontalement.
- Un ballon représente la hauteur de ta voix en temps réel.
- Si ta note chantée correspond à la note cible → tu marques des points.
- À la fin, tu obtiens un score, une précision, un certificat et un lien partageable (signé).

Deux modes de jeu :

| Mode | Caractéristiques |
|------|------------------|
| 🎯 **PRO** | stricte justesse / reset de note après silence |
| 🎉 **FUN** | tolérant / conserve la dernière note / débutants |

---

## 🧠 Fonctionnalités principales

- détection vocale en temps réel via **Web Audio API**
- extraction de pitch via **NSDF (Normalized Square Difference Function)** maison
- lissage via médiane sur 5 échantillons
- gestion des octaves via comparaison modulo 12
- lecture MIDI via `midi-player-js`
- rendu rétro via Canvas
- certificat + URL signée
- modes PRO & FUN

---

## 🎶 Pipeline audio : de la voix → au pitch → au score

### 1️⃣ Acquisition du signal vocal

Dans `initAudio()` :

```js
navigator.mediaDevices.getUserMedia({
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false }
});
```

→ flux **en mémoire uniquement**, pas d’enregistrement.

---

### 2️⃣ Extraction du pitch via **NSDF**

Fonction interne clé :

```js
detectFreqNSDF_bounded(buf, sampleRate)
```

Étapes :

- calcul de la NSDF sur une fenêtre (≈ 2048 échantillons)
- choix de τ optimale via pics locaux
- conversion fréquence = `sampleRate / τ`

Avantages :

- robuste à la voix humaine
- faible latence
- pas besoin de FFT

---

### 3️⃣ Lissage temporel

Dans `renderFrame()` :

```js
medianBuffer.push(n);
if (medianBuffer.length > 5) medianBuffer.shift();
currentVocalNote = [...medianBuffer].sort((a,b)=>a-b)[2];
```

→ médiane des **5 derniers** pitchs.  
→ ≈ 80–100 ms de stabilisation.

---

### 4️⃣ Gestion du silence

- en PRO : `currentVocalNote = null`
- en FUN : on conserve la dernière note, sinon `CENTER_NOTE`

---

### 5️⃣ Gestion octave / pitch class

Fonction :

```js
foldToNearestSamePitchClass(vocalNote, targetNote)
```

Compare `mod12` pour accepter une note juste mais transposée.

---

### 6️⃣ Détection de justesse

Fonction :

```js
isPitchAccepted(vocalNote, targetNote)
```

Tolérances :

| Mode | HIT | OCTAVE |
|------|-----|--------|
| PRO | ±1.5 | ±1.8 |
| FUN | ±3.0 | ±3.0 |

→ PRO = stricte  
→ FUN = permissive  

---

### 7️⃣ Scoring & timing

Chaque note MIDI inclut :

```
{ n, t, d }
```

Processus :

- note active = comparaison pitch
- bonus aléatoires
- dernière note sustain 4 beats
- fin après `lastNoteEnd + padding`

---

## 🕹️ Modes de jeu

### 🎯 Mode PRO
- précision stricte
- silence = perte de note
- apprentissage sérieux

### 🎉 Mode FUN
- note persistante
- tolérance large
- idéal pour débuter

---

## 🗂️ Structure du projet

```
.
├── index.html
├── app.js
├── musique.mid
├── stadium.mp3
├── lyrics.txt
├── favicon & manifest
```

---

## 🛠️ Installation

```bash
git clone git@github.com:Stabadev/assemiouzik.git
cd assemiouzik
python3 -m http.server
```

Puis :

- ouvrir `http://localhost:8000`
- autoriser le microphone
- chanter 🎤

---

## 🌐 Partage & signature

Le certificat encode :

- pseudo
- score
- précision
- date

Signature :

```js
makeSignature(nick, score, accuracy, date)
```

→ empêche une modification simple du score dans l’URL.

---


## 📝 Licence

MIT — voir `LICENSE`  
Auteurs : `gg-overflow` & `Stabadev`

---

## 💚 Démo

https://chanter.rogues.fr

> Où le chant rencontre le rétro gaming & le Chaudron 🏟️
