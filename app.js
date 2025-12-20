/**
 * app.js — version avec :
 * - pseudo en fin de partie + URL signée
 * - affichage du beat
 * - dernière note sustain au moins 4 beats (timeline prolongée)
 * - certificat de réussite avec médaille, pseudo, score, date
 * - texte RETRY -> vrai bouton cliquable sur le canvas pour relancer la session
 * - plus de bouton PARTAGER (reste seulement COPIER LE LIEN)
 */

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const lyricDiv = document.getElementById('lyrics-display');

  const container = document.getElementById('game-container');
  const progressEl = document.getElementById('progress-val');
  const scoreEl = document.getElementById('score-val');
  const beatEl = document.getElementById('beat-val');

  // UI jeux
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const replayBtn = document.getElementById('replayBtn');
  const gameBtnsDiv = document.getElementById('game-btns');
  const loadingStatus = document.getElementById('loading-status');
  const btnMetro = document.getElementById('btnMetro');
  const btnDrum = document.getElementById('btnDrum');
  const controlsRoot = document.querySelector('.controls');

  // Overlay de fin
  const endScreen = document.getElementById('end-screen-ui');
  const endPanel = document.querySelector('.end-panel');
  const endTitle = document.getElementById('end-title');
  const endSummary = document.getElementById('end-summary');
  const pseudoRow = document.getElementById('pseudo-row');
  const nicknameInput = document.getElementById('nickname-input');
  const saveScoreBtn = document.getElementById('save-score-btn');
  const saveRow = document.getElementById('save-row');
  const copyUrlBtn = document.getElementById('copy-url-btn');
  const endMessage = document.getElementById('end-message');
  const shareActions = document.getElementById('share-actions');

  endScreen.classList.add('hidden');
  let lastShareUrl = null;

  // Dock bas pour le bouton "COPIER LE LIEN" en mode certificat
  const shareDock = document.createElement('div');
  shareDock.id = 'share-dock';
  shareDock.style.position = 'absolute';
  shareDock.style.left = '50%';
  shareDock.style.bottom = '30px';
  shareDock.style.transform = 'translateX(-50%)';
  shareDock.style.display = 'none';
  shareDock.style.textAlign = 'center';
  shareDock.style.pointerEvents = 'auto';

  shareActions.classList.remove('hidden');
  shareDock.appendChild(shareActions);
  endScreen.appendChild(shareDock);

  // ---------------- CONFIG ----------------
  const MIDI_FILE_PATH = 'musique.mid';
  const STADIUM_FILE_PATH = 'stadium.mp3';
  const LYRICS_FILE_PATH = 'lyrics.txt';

  const BEATS_PER_LYRIC_LINE = 8;

  const BASE_W = 950;
  const BASE_H = 460;

  const PIXELS_PER_BEAT = 220;
  const NOTE_HEIGHT_UNIT = 15;
  const CENTER_NOTE = 60;
  const TRIGGER_X = 250;
  const PIANO_WIDTH = 80;
  const BPM = 120;
  const BEAT_DURATION = 60 / BPM;

  const MIN_FREQ = 70;
  const MAX_FREQ = 900;

  const HIT_TOL = 1.5;
  const OCTAVE_SEMI = 12;
  const OCTAVE_TOL = 1.8;

  const END_PADDING_BEATS = 2.0;

  const COUNTDOWN_SEC = 3.2;
  const COUNTDOWN_BEAT_BEEP = 0.42;

  const HIT_JINGLE_VOL = 0.06;
  const START_JINGLE_VOL = 0.10;

  const BONUS_50_CHANCE = 0.18;
  const BONUS_100_CHANCE = 0.08;

  const MELODY_ENVELOPE_GAIN = 0.22;

  const BALL_DIAM = 28;
  const BALL_BELT = 2;
  const BALL_PATCH_SCALE = 0.32;

  // ---------------- VOLUMES ----------------
  const volumes = {
    melody: 1.00,
    stadium: 0.16,
    metronome: 0.55,
    drums: 0.50
  };

  // ---------------- HELPERS ----------------
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function mod12(n) { return ((n % 12) + 12) % 12; }
  function hsl(h, s, l) { return `hsl(${h} ${s}% ${l}%)`; }
  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function noteToY(note) { return 250 - (note - CENTER_NOTE) * NOTE_HEIGHT_UNIT; }
  function isSamePitchClass(a, b) { return mod12(Math.round(a)) === mod12(Math.round(b)); }

  function isPitchAccepted(vocalNote, targetNote) {
    if (!vocalNote) return false;
    const diff = vocalNote - targetNote;
    if (Math.abs(diff) <= HIT_TOL) return true;
    if (Math.abs(diff - OCTAVE_SEMI) <= OCTAVE_TOL) return true;
    if (Math.abs(diff + OCTAVE_SEMI) <= OCTAVE_TOL) return true;
    return false;
  }

  function foldToNearestSamePitchClass(vocalNote, targetNote) {
    if (!vocalNote) return null;
    const targetPc = mod12(Math.round(targetNote));
    const base = vocalNote;

    let best = null;
    let bestCost = Infinity;

    for (let k = -3; k <= 3; k++) {
      const candidate = base + 12 * k;
      if (mod12(Math.round(candidate)) !== targetPc) continue;
      const cost = Math.abs(candidate - targetNote);
      if (cost < bestCost) { bestCost = cost; best = candidate; }
    }
    return best !== null ? best : targetNote;
  }

  function escapeHtml(s) {
    return (s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ----------- SIGNATURE & URL SCORE -----------
  const SCORE_SALT = 'MVOCAL42_SALT';

  function makeSignature(nick, score, accuracy, dateStr) {
    const safeNick = (nick || '').toUpperCase();
    const s = `${safeNick}|${score}|${accuracy}|${dateStr}|${SCORE_SALT}`;
    let h1 = 0, h2 = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = (h1 * 31 + c) & 0xffffffff;
      h2 = (h2 * 131 + c) & 0xffffffff;
    }
    const mixed = (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
    return mixed.slice(0, 16);
  }

  function buildShareUrl(nick, score, accuracy, dateStr) {
    const params = new URLSearchParams(window.location.search);
    params.set('nick', nick);
    params.set('score', String(score));
    params.set('acc', String(accuracy));
    params.set('date', dateStr);
    params.set('sig', makeSignature(nick, score, accuracy, dateStr));
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', url);
    lastShareUrl = url;
    return url;
  }

  function parseSharedFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const nick = params.get('nick');
    const scoreStr = params.get('score');
    const accStr = params.get('acc');
    const dateStr = params.get('date');
    const sig = params.get('sig');

    if (!nick || !scoreStr || !accStr || !dateStr || !sig) return null;

    const score = parseInt(scoreStr, 10);
    const accuracy = parseInt(accStr, 10);
    if (!Number.isFinite(score) || !Number.isFinite(accuracy)) return null;

    const expected = makeSignature(nick, score, accuracy, dateStr);
    if (sig !== expected) return null;

    return { nick, score, accuracy, date: dateStr, isValid: true };
  }

  // ---------------- RESPONSIVE LAYOUT ----------------
  function applyResponsiveLayout() {
    const vw = Math.max(320, window.innerWidth);
    const margin = 16;
    const targetW = Math.min(BASE_W, vw - margin);
    const targetH = Math.round(targetW * (BASE_H / BASE_W));

    container.style.width = `${targetW}px`;
    container.style.height = `${targetH}px`;

    canvas.style.width = `${targetW}px`;
    canvas.style.height = `${targetH}px`;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(targetW * dpr);
    canvas.height = Math.round(targetH * dpr);

    lyricDiv.style.width = `${targetW}px`;

    const unitScale = targetW / BASE_W;
    ctx.setTransform(dpr * unitScale, 0, 0, dpr * unitScale, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', () => applyResponsiveLayout(), { passive: true });
  applyResponsiveLayout();

  // ---------------- STATE ----------------
  let melody = [];
  let firstNoteT = 0;
  let lastNoteEndT = 0;

  let score = 0, notesPassed = 0, notesHit = 0;

  let isMetroEnabled = false;
  let isDrumEnabled = false;
  let lastProcessedBeat = -1;

  let audioCtx = null, analyser = null, dataArray = null;
  let masterOsc = null, subOsc = null, masterGain = null;

  // buses
  let melodyBusGain = null;
  let melodyCompressor = null;
  let sfxMetroGain = null;
  let sfxDrumGain = null;
  let stadiumGain = null;

  const stadium = {
    buffer: null,
    source: null,
    isLoaded: false,
    isPlaying: false,
    loadingPromise: null
  };

  let state = 'idle'; // 'idle'|'countdown'|'playing'|'finished'
  let startTime = 0;
  let countdownStart = 0;
  let finishStats = null; // {score, accuracy, nick?, date?}

  let currentVocalNote = 60;
  let displayBallY = noteToY(60);
  let ballRotation = 0;
  const medianBuffer = [];

  let trophies = [];
  let sparks = [];
  let rings = [];
  let floatTexts = [];
  let fireworks = [];

  // zone cliquable du bouton RETRY sur le canvas
  let retryCanvasButton = null;

  // 🏅 Médailles
  const medals = [];
  function initMedals() {
    medals.length = 0;
    for (let i = 0; i < 6; i++) {
      medals.push({
        x: 160 + i * 120,
        y: 54,
        phase: Math.random() * Math.PI * 2,
        blink: 0,
        shine: Math.random(),
        nextBlinkAt: performance.now() + (700 + Math.random() * 2000)
      });
    }
  }
  initMedals();

  // Lyrics
  let lyricsRawLines = null;
  let lyricsItems = [];
  let lyricsLoaded = false;

  // ---------------- UI TOGGLES ----------------
  function updateToggle(btn, label, on) {
    btn.classList.toggle('btn-on', on);
    btn.classList.toggle('btn-off', !on);
    btn.textContent = `${label}: ${on ? 'ON' : 'OFF'}`;
  }
  updateToggle(btnMetro, 'METRONOME', false);
  updateToggle(btnDrum, 'BATTERIE', false);

  btnMetro.addEventListener('click', () => {
    isMetroEnabled = !isMetroEnabled;
    updateToggle(btnMetro, 'METRONOME', isMetroEnabled);
  });
  btnDrum.addEventListener('click', () => {
    isDrumEnabled = !isDrumEnabled;
    updateToggle(btnDrum, 'BATTERIE', isDrumEnabled);
  });

  // ---------------- VOLUME UI ----------------
  function makeSliderRow(label, key) {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '10px';
    wrap.style.marginTop = '8px';
    wrap.style.justifyContent = 'center';

    const lab = document.createElement('div');
    lab.textContent = label;
    lab.style.fontSize = '8px';
    lab.style.minWidth = '140px';
    lab.style.textAlign = 'right';
    lab.style.color = '#111';
    lab.style.textShadow = '1px 1px rgba(255,255,255,0.3)';

    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.value = String(Math.round(volumes[key] * 100));
    input.style.width = '180px';

    const val = document.createElement('div');
    val.style.fontSize = '8px';
    val.style.minWidth = '40px';
    val.style.textAlign = 'left';
    val.style.color = '#111';
    val.textContent = `${input.value}%`;

    input.addEventListener('input', () => {
      val.textContent = `${input.value}%`;
      volumes[key] = clamp(parseInt(input.value, 10) / 100, 0, 1);
      applyVolumes();
    });

    wrap.appendChild(lab);
    wrap.appendChild(input);
    wrap.appendChild(val);
    return wrap;
  }

  function injectVolumeUI() {
    const existing = document.getElementById('volume-panel');
    if (existing) return;

    const panel = document.createElement('div');
    panel.id = 'volume-panel';
    panel.style.marginTop = '10px';
    panel.style.paddingTop = '10px';
    panel.style.borderTop = '2px solid rgba(0,0,0,0.2)';

    const title = document.createElement('div');
    title.textContent = "VOLUMES";
    title.style.fontSize = '9px';
    title.style.marginBottom = '6px';

    panel.appendChild(title);
    panel.appendChild(makeSliderRow("MELODIE (guide)", "melody"));
    panel.appendChild(makeSliderRow("FOULE (stade)", "stadium"));
    panel.appendChild(makeSliderRow("METRONOME", "metronome"));
    panel.appendChild(makeSliderRow("BATTERIE", "drums"));

    controlsRoot.appendChild(panel);
  }
  injectVolumeUI();

  function applyVolumes() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;

    if (melodyBusGain) melodyBusGain.gain.setTargetAtTime(1.15 * volumes.melody, t, 0.02);
    if (stadiumGain) stadiumGain.gain.setTargetAtTime(0.10 * volumes.stadium, t, 0.05);
    if (sfxMetroGain) sfxMetroGain.gain.setTargetAtTime(0.25 * volumes.metronome, t, 0.02);
    if (sfxDrumGain) sfxDrumGain.gain.setTargetAtTime(0.35 * volumes.drums, t, 0.02);
  }

  // ---------------- MIDI ----------------
  async function loadMidi() {
    try {
      const response = await fetch(MIDI_FILE_PATH);
      const arrayBuffer = await response.arrayBuffer();
      const player = new window.MidiPlayer.Player();
      player.loadArrayBuffer(arrayBuffer);

      melody = player.getEvents().flat()
        .filter(e => e.name === 'Note on' && e.velocity > 0)
        .map(e => ({
          n: e.noteNumber,
          t: e.tick / player.division,
          d: e.duration / player.division,
          validated: false,
          passed: false
        }))
        .sort((a, b) => a.t - b.t);

      if (melody.length > 0) {
        firstNoteT = melody[0].t;
        lastNoteEndT = melody.reduce((m, n) => Math.max(m, n.t + (n.d || 0.5)), melody[0].t);

        // 🔔 on garantit au moins 4 beats complets pour la dernière note
        const lastNote = melody[melody.length - 1];
        lastNoteEndT = Math.max(lastNoteEndT, lastNote.t + 4.0);

        startBtn.classList.remove('hidden');
        loadingStatus.innerText = "STAGE PRÊT !";
      } else {
        loadingStatus.innerText = "MIDI VIDE";
      }
    } catch (e) {
      console.error(e);
      loadingStatus.innerText = "ERREUR MIDI";
    }
  }

  // ---------------- LYRICS TXT ----------------
  async function loadLyricsTxt() {
    try {
      const res = await fetch(LYRICS_FILE_PATH);
      if (!res.ok) throw new Error(`fetch lyrics.txt failed: ${res.status}`);
      const text = await res.text();
      lyricsRawLines = text.replace(/\r/g, '').split('\n');
      lyricsLoaded = true;
    } catch (e) {
      console.warn("Lyrics TXT not loaded:", e);
      lyricsRawLines = null;
      lyricsItems = [];
      lyricsLoaded = false;
    }
  }

  function buildLyricsSchedule() {
    lyricsItems = [];
    if (!lyricsRawLines || !Array.isArray(lyricsRawLines)) return;

    let beatCursor = firstNoteT;

    for (const raw of lyricsRawLines) {
      const line = (raw ?? '').trimEnd();
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) continue;

      if (trimmed.length === 0) {
        beatCursor += BEATS_PER_LYRIC_LINE;
        continue;
      }

      const mPause1 = trimmed.match(/^~\s*(\d+)\s*$/);
      if (mPause1) {
        beatCursor += (parseInt(mPause1[1], 10) || 1) * BEATS_PER_LYRIC_LINE;
        continue;
      }

      const mPause2 = trimmed.match(/^pause\s*(\d+)?\s*$/i);
      if (mPause2) {
        beatCursor += (mPause2[1] ? (parseInt(mPause2[1], 10) || 1) : 1) * BEATS_PER_LYRIC_LINE;
        continue;
      }

      const mAbs = trimmed.match(/^@(\d+)\s+(.*)$/);
      if (mAbs) {
        const abs = parseInt(mAbs[1], 10) || 0;
        const txt = (mAbs[2] || '').trim();
        if (txt.length > 0) lyricsItems.push({ beat: firstNoteT + abs, text: txt });
        beatCursor = (firstNoteT + abs) + BEATS_PER_LYRIC_LINE;
        continue;
      }

      lyricsItems.push({ beat: beatCursor, text: trimmed });
      beatCursor += BEATS_PER_LYRIC_LINE;
    }

    lyricsItems.sort((a, b) => a.beat - b.beat);
  }

  function setupLyricsBoxStyle() {
    lyricDiv.style.height = '90px';
    lyricDiv.style.padding = '8px 12px';
    lyricDiv.style.display = 'flex';
    lyricDiv.style.flexDirection = 'column';
    lyricDiv.style.justifyContent = 'center';
    lyricDiv.style.gap = '6px';
    lyricDiv.style.lineHeight = '1.15';
    lyricDiv.style.fontSize = '12px';
  }

  function findCurrentLyricIndex(currentBeat) {
    if (!lyricsItems || lyricsItems.length === 0) return -1;
    let lo = 0, hi = lyricsItems.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lyricsItems[mid].beat <= currentBeat) { ans = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return ans;
  }

  function renderLyrics3Lines(currentBeat) {
    if (!lyricsLoaded || !lyricsItems || lyricsItems.length === 0) return;

    const idx = findCurrentLyricIndex(currentBeat);
    const prevText = (idx > 0) ? (lyricsItems[idx - 1]?.text || "") : "";
    const curText  = (idx >= 0) ? (lyricsItems[idx]?.text || "") : "";
    const nextText = (idx >= 0) ? (lyricsItems[idx + 1]?.text || "") : (lyricsItems[0]?.text || "");

    let prog = 0;
    if (idx >= 0) prog = clamp((currentBeat - lyricsItems[idx].beat) / BEATS_PER_LYRIC_LINE, 0, 1);

    const nextAlpha = 0.35 + 0.65 * prog;
    const nextGlow  = 0.12 + 0.45 * prog;

    lyricDiv.innerHTML =
      `${prevText ? `<div style="color:rgba(255,255,255,0.42); text-shadow:2px 2px #000;">${escapeHtml(prevText)}</div>`
                  : `<div style="color:rgba(255,255,255,0.14); text-shadow:2px 2px #000;"> </div>`}
       ${curText ? `<div style="color:#ffffff; text-shadow:2px 2px #000; font-weight:700;">${escapeHtml(curText)}</div>`
                 : `<div style="color:rgba(255,255,255,0.65); text-shadow:2px 2px #000;">...</div>`}
       ${nextText ? `<div style="color:rgba(255,255,255,${nextAlpha.toFixed(3)}); text-shadow:2px 2px #000, 0 0 10px rgba(255,255,255,${nextGlow.toFixed(3)});">${escapeHtml(nextText)}</div>`
                  : `<div style="color:rgba(255,255,255,0.14); text-shadow:2px 2px #000;"> </div>`}`;
  }

  // ---------------- AUDIO INIT ----------------
  async function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      melodyBusGain = audioCtx.createGain();
      melodyCompressor = audioCtx.createDynamicsCompressor();

      melodyCompressor.threshold.setValueAtTime(-18, audioCtx.currentTime);
      melodyCompressor.knee.setValueAtTime(20, audioCtx.currentTime);
      melodyCompressor.ratio.setValueAtTime(6, audioCtx.currentTime);
      melodyCompressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
      melodyCompressor.release.setValueAtTime(0.10, audioCtx.currentTime);

      sfxMetroGain = audioCtx.createGain();
      sfxDrumGain = audioCtx.createGain();
      stadiumGain = audioCtx.createGain();

      melodyBusGain.connect(melodyCompressor);
      melodyCompressor.connect(audioCtx.destination);

      sfxMetroGain.connect(audioCtx.destination);
      sfxDrumGain.connect(audioCtx.destination);
      stadiumGain.connect(audioCtx.destination);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false }
      });

      const source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      dataArray = new Float32Array(analyser.fftSize);

      masterOsc = audioCtx.createOscillator();
      subOsc = audioCtx.createOscillator();
      masterGain = audioCtx.createGain();

      masterOsc.type = 'sine';
      subOsc.type = 'triangle';
      masterOsc.connect(masterGain);
      subOsc.connect(masterGain);
      masterGain.connect(melodyBusGain);

      masterGain.gain.value = 0;
      masterOsc.start();
      subOsc.start();

      applyVolumes();
    }

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    await ensureStadiumLoaded();
  }

  // ---------------- STADIUM MP3 ----------------
  async function ensureStadiumLoaded() {
    if (stadium.isLoaded) return;
    if (stadium.loadingPromise) return stadium.loadingPromise;

    stadium.loadingPromise = (async () => {
      try {
        const res = await fetch(STADIUM_FILE_PATH);
        if (!res.ok) throw new Error(`fetch stadium.mp3 failed: ${res.status}`);
        const arr = await res.arrayBuffer();
        stadium.buffer = await audioCtx.decodeAudioData(arr);
        stadium.isLoaded = true;
      } catch (e) {
        console.error(e);
        stadium.isLoaded = false;
      }
    })();

    return stadium.loadingPromise;
  }

  function startStadiumLoop() {
    if (!audioCtx || !stadium.isLoaded || stadium.isPlaying) return;
    stopStadiumLoop();

    const src = audioCtx.createBufferSource();
    src.buffer = stadium.buffer;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = stadium.buffer.duration;
    src.connect(stadiumGain);

    const t = audioCtx.currentTime;
    stadiumGain.gain.cancelScheduledValues(t);
    stadiumGain.gain.setValueAtTime(0.0001, t);
    stadiumGain.gain.exponentialRampToValueAtTime(0.10 * volumes.stadium, t + 0.45);

    src.start(t);
    stadium.source = src;
    stadium.isPlaying = true;

    src.onended = () => {
      if (stadium.source === src) stadium.isPlaying = false;
    };
  }

  function stopStadiumLoop() {
    if (!audioCtx || !stadiumGain) return;
    const t = audioCtx.currentTime;

    stadiumGain.gain.cancelScheduledValues(t);
    stadiumGain.gain.setValueAtTime(stadiumGain.gain.value || (0.10 * volumes.stadium), t);
    stadiumGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

    if (stadium.source) {
      try { stadium.source.stop(t + 0.20); } catch {}
      try { stadium.source.disconnect(); } catch {}
      stadium.source = null;
    }
    stadium.isPlaying = false;
  }

  // ---------------- JINGLES ----------------
  function playTone(freq, t, dur, type = 'square', vol = 0.1) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function playStartCountdownJingle(baseT) {
    playTone(660, baseT + 0 * COUNTDOWN_BEAT_BEEP, 0.12, 'square', START_JINGLE_VOL);
    playTone(660, baseT + 1 * COUNTDOWN_BEAT_BEEP, 0.12, 'square', START_JINGLE_VOL);
    playTone(660, baseT + 2 * COUNTDOWN_BEAT_BEEP, 0.12, 'square', START_JINGLE_VOL);

    const goT = baseT + 3 * COUNTDOWN_BEAT_BEEP;
    playTone(523.25, goT, 0.25, 'triangle', START_JINGLE_VOL * 0.9);
    playTone(659.25, goT, 0.25, 'triangle', START_JINGLE_VOL * 0.8);
    playTone(783.99, goT, 0.25, 'triangle', START_JINGLE_VOL * 0.7);
  }

  let lastHitJingleAt = 0;
  function playHitJingle(midiNote) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    if (now - lastHitJingleAt < 0.06) return;
    lastHitJingleAt = now;

    const f = midiToFreq(midiNote);
    playTone(f * 2, now, 0.08, 'square', HIT_JINGLE_VOL);
    playTone(f * 2.5, now + 0.03, 0.10, 'triangle', HIT_JINGLE_VOL * 0.8);
  }

  // ---------------- DRUMS / METRO ----------------
  function playKick(t) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(0.01, t + 0.5);
    g.gain.setValueAtTime(0.8, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
    o.connect(g); g.connect(sfxDrumGain);
    o.start(t); o.stop(t + 0.5);
  }

  function playSnare(t) {
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.1, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const src = audioCtx.createBufferSource();
    src.buffer = buffer;

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

    src.connect(g); g.connect(sfxDrumGain);
    src.start(t);
  }

  function playHiHat(t) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(10000, t);
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
    o.connect(g); g.connect(sfxMetroGain);
    o.start(t); o.stop(t + 0.05);
  }

  // ---------------- PITCH DETECTOR ----------------
  function detectFreqNSDF_bounded(buf, sampleRate) {
    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
    if (Math.sqrt(sumSq / buf.length) < 0.012) return null;

    const size = Math.floor(buf.length / 2);
    const minTau = Math.max(10, Math.floor(sampleRate / MAX_FREQ));
    const maxTau = Math.min(size - 2, Math.floor(sampleRate / MIN_FREQ));
    const nsdf = new Float32Array(maxTau + 2);

    for (let t = minTau; t <= maxTau; t++) {
      let acf = 0, div = 0;
      for (let i = 0; i < size; i++) {
        const a = buf[i];
        const b = buf[i + t];
        acf += a * b;
        div += a * a + b * b;
      }
      nsdf[t] = (div === 0) ? 0 : (2 * acf) / div;
    }

    let maxT = -1;
    for (let t = Math.max(minTau, 10); t < maxTau; t++) {
      if (nsdf[t] > 0.8 && nsdf[t] > nsdf[t - 1] && nsdf[t] > nsdf[t + 1]) {
        if (maxT === -1 || nsdf[t] > nsdf[maxT]) maxT = t;
      }
    }
    return (maxT === -1) ? null : (sampleRate / maxT);
  }

  // ---------------- VISUALS ----------------
  function drawFootballPitch(scrollX, tSec) {
    const W = BASE_W, H = BASE_H;
    const hue = 115 + 12 * Math.sin(tSec * 0.35);
    const stripeW = 120;

    for (let x = -stripeW; x < W + stripeW; x += stripeW) {
      const idx = Math.floor((x + scrollX) / stripeW);
      const light = (idx % 2 === 0) ? 34 : 28;
      ctx.fillStyle = hsl(hue, 65, light);
      ctx.fillRect(x - (scrollX % stripeW), 0, stripeW, H);
    }

    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, W - 24, H - 24);

    ctx.beginPath();
    ctx.moveTo(W / 2, 12);
    ctx.lineTo(W / 2, H - 12);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 70, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function updateMedals() {
    const nowMs = performance.now();
    for (const m of medals) {
      if (nowMs >= m.nextBlinkAt) {
        m.blink = 1.0;
        m.nextBlinkAt = nowMs + 1200 + Math.random() * 2600;
      }
      if (m.blink > 0) m.blink = Math.max(0, m.blink - 0.05);

      m.shine += 0.012;
      if (m.shine > 1.3) m.shine = -0.3;
    }
  }

  function drawMedal(m, tSec) {
    const bounce = Math.sin(tSec * 2.2 + m.phase) * 3.0;
    const rot = Math.sin(tSec * 1.6 + m.phase) * 0.08;

    ctx.save();
    ctx.translate(m.x, m.y + bounce);
    ctx.rotate(rot);

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#d63031";
    ctx.fillRect(-6, -24, 5, 16);
    ctx.fillStyle = "#0984e3";
    ctx.fillRect(1, -24, 5, 16);

    const glow = m.blink > 0 ? 0.75 : 0.0;
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(255, 224, 130, ${0.90 + glow * 0.10})`;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(255, 200, 70, ${0.85 + glow * 0.15})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
    ctx.stroke();

    const sx = (m.shine * 30) - 15;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.25 * glow;
    ctx.translate(sx, -2);
    ctx.rotate(-0.5);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillRect(-2, -14, 4, 28);
    ctx.restore();

    ctx.restore();
  }

  // --- FX ---
  function spawnSparks(x, y, intensity = 1.0) {
    const count = Math.floor(22 * intensity);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (2 + Math.random() * 4.5) * (0.9 + intensity * 0.5);
      sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5, life: 1.0, size: 1.5 + Math.random() * 2.5 });
    }
  }

  function spawnRingExplosion(x, y, mult = 1.0) {
    rings.push({ x, y, r: 6, vr: 7.5 * mult, life: 1.0, lw: 4.5 * mult });
    rings.push({ x, y, r: 2, vr: 10.0 * mult, life: 0.9, lw: 2.8 * mult });
  }

  function spawnTrophy(x, y) {
    trophies.push({ x, y, vy: -Math.random() * 2 - 2.2, vx: -1.6, life: 1.0, rot: 0, scale: 1.6 + Math.random() * 0.35 });
    spawnSparks(x, y, 1.0);
    spawnRingExplosion(x, y, 1.0);
  }

  function drawTrophy(t) {
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.rot);
    ctx.globalAlpha = t.life;
    ctx.scale(t.scale, t.scale);

    ctx.fillStyle = "#FDE68A";
    ctx.fillRect(-10, -12, 20, 14);
    ctx.fillRect(-3, 2, 6, 10);
    ctx.fillRect(-10, 10, 20, 3);

    ctx.fillStyle = "#FBBF24";
    ctx.fillRect(-13, -14, 3, 8);
    ctx.fillRect(10, -14, 3, 8);

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(-7, -10, 3, 10);

    ctx.restore();
  }

  function drawSparks() {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.12;
      p.vx *= 0.99;
      p.life -= 0.03;
      if (p.life <= 0) { sparks.splice(i, 1); continue; }

      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.strokeStyle = hsl(45 + Math.random() * 20, 90, 60);
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 1.5, p.y - p.vy * 1.5);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawRings() {
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.r += r.vr;
      r.vr *= 0.92;
      r.life -= 0.045;
      if (r.life <= 0) { rings.splice(i, 1); continue; }

      ctx.save();
      ctx.globalAlpha = r.life;
      ctx.lineWidth = r.lw;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function spawnFloatText(txt, x, y, kind) {
    floatTexts.push({ txt, x, y, vy: -1.7, life: 1.0, kind, wobble: Math.random() * Math.PI * 2 });
  }

  function drawFloatTexts(tSec) {
    for (let i = floatTexts.length - 1; i >= 0; i--) {
      const ft = floatTexts[i];
      ft.y += ft.vy;
      ft.x += Math.sin(tSec * 6 + ft.wobble) * 0.35;
      ft.life -= 0.02;
      if (ft.life <= 0) { floatTexts.splice(i, 1); continue; }

      ctx.save();
      ctx.globalAlpha = ft.life;
      ctx.textAlign = "center";
      ctx.font = "12px 'Press Start 2P'";
      ctx.fillStyle = (ft.kind === 'bonus100') ? "#f1c40f" : "#2ecc71";
      ctx.fillText(ft.txt, ft.x, ft.y);
      ctx.restore();
    }
  }

  function spawnFireworks(x, y, power = 1.0) {
    const bursts = 2 + (Math.random() < 0.45 ? 1 : 0);
    for (let b = 0; b < bursts; b++) {
      const hueBase = Math.random() * 360;
      const count = Math.floor((46 + Math.random() * 36) * power);
      const spread = 1.8 + Math.random() * 1.3;

      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.2;
        const sp = (3.2 + Math.random() * 6.6) * spread;
        fireworks.push({
          x: x + (Math.random() * 10 - 5),
          y: y + (Math.random() * 10 - 5),
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - (1.9 + Math.random() * 1.4),
          g: 0.10 + Math.random() * 0.06,
          life: 1.0,
          hue: (hueBase + Math.random() * 50) % 360,
          size: 1.3 + Math.random() * 2.0
        });
      }
    }
    spawnRingExplosion(x, y, 1.3 * power);
    spawnSparks(x, y, 1.8 * power);
  }

  function drawFireworks() {
    for (let i = fireworks.length - 1; i >= 0; i--) {
      const p = fireworks[i];
      p.x += p.vx; p.y += p.vy;
      p.vy += p.g;
      p.vx *= 0.985;
      p.life -= 0.028;
      if (p.life <= 0) { fireworks.splice(i, 1); continue; }

      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = hsl(p.hue, 95, 65);
      ctx.fillRect(p.x, p.y, p.size, p.size);
      ctx.restore();
    }
  }

  function maybeRollBonus(x, y) {
    const r = Math.random();
    let bonus = 0;
    if (r < BONUS_100_CHANCE) bonus = 100;
    else if (r < BONUS_100_CHANCE + BONUS_50_CHANCE) bonus = 50;

    if (bonus > 0) {
      score += bonus;
      const power = (bonus === 100) ? 1.35 : 1.0;
      spawnFireworks(x + 64, y - 8, power);
      spawnFloatText(bonus === 100 ? "+100" : "+50", x + 72, y - 12, bonus === 100 ? "bonus100" : "bonus50");
    }
  }

  function drawPixelCircle(cx, cy, r, fill) {
    ctx.fillStyle = fill;
    const rr = r * r;
    const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r);
    const y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= rr) ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  function drawBall(x, y, isHitting) {
    const r = Math.round(BALL_DIAM / 2);
    ctx.save();
    ctx.translate(x, y);
    if (isHitting) {
      ballRotation += 0.18;
      ctx.rotate(ballRotation);
    }

    drawPixelCircle(0, 0, r + BALL_BELT, "rgba(0,0,0,0.85)");
    drawPixelCircle(0, 0, r, "#ffffff");

    const pr = Math.max(4, Math.round(BALL_PATCH_SCALE * r));
    drawPixelCircle(0, 0, pr, "#000000");

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(-r + 3, -r + 4, 2 * r - 6, 1);
    ctx.fillRect(-r + 3, r - 5, 2 * r - 6, 1);

    ctx.restore();
  }

  // ---------------- END SPLASH (canvas) ----------------
  function drawEndSplash() {
    if (!finishStats) return;

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, BASE_W, BASE_H);

    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.fillRect(110, 70, BASE_W - 220, BASE_H - 140);

    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 4;
    ctx.strokeRect(110, 70, BASE_W - 220, BASE_H - 140);

    ctx.textAlign = "center";

    ctx.fillStyle = "#ffffff";
    ctx.font = "32px 'Press Start 2P'";
    ctx.fillText("CERTIFICAT", BASE_W / 2, 120);

    ctx.font = "18px 'Press Start 2P'";
    ctx.fillText("DE REUSSITE", BASE_W / 2, 150);

    // Médaille centrale
    ctx.save();
    ctx.translate(BASE_W / 2, 190);
    ctx.fillStyle = "#d63031";
    ctx.fillRect(-14, -42, 8, 24);
    ctx.fillStyle = "#0984e3";
    ctx.fillRect(6, -42, 8, 24);

    ctx.fillStyle = "#FDE68A";
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#FBBF24";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "16px 'Press Start 2P'";
    ctx.fillText("★", 0, 6);
    ctx.restore();

    ctx.fillStyle = "#f1c40f";
    ctx.font = "16px 'Press Start 2P'";
    ctx.fillText(`SCORE: ${finishStats.score}`, BASE_W / 2, 240);

    ctx.fillStyle = "#2ecc71";
    ctx.font = "14px 'Press Start 2P'";
    ctx.fillText(`PRECISION: ${finishStats.accuracy}%`, BASE_W / 2, 270);

    if (finishStats.nick) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "12px 'Press Start 2P'";
      ctx.fillText(`PSEUDO: ${finishStats.nick}`, BASE_W / 2, 300);
    }

    if (finishStats.date) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "12px 'Press Start 2P'";
      ctx.fillText(`DATE: ${finishStats.date}`, BASE_W / 2, 330);
    }

    // Bouton RETRY cliquable sur le canvas
    const btnW = 220;
    const btnH = 40;
    const btnX = BASE_W / 2 - btnW / 2;
    const btnY = 360;

    retryCanvasButton = { x: btnX, y: btnY, w: btnW, h: btnH };

    ctx.fillStyle = "#2ecc71";
    ctx.fillRect(btnX, btnY, btnW, btnH);

    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.strokeRect(btnX, btnY, btnW, btnH);

    ctx.fillStyle = "#000000";
    ctx.font = "14px 'Press Start 2P'";
    ctx.fillText("RETRY POUR JOUER", BASE_W / 2, btnY + 26);

    ctx.restore();
  }

  // ---------------- FIN DE PARTIE ----------------
  function computeTodayDateStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function setOverlayModeForm() {
    endScreen.classList.remove('hidden');
    endScreen.classList.remove('end-final');
    if (!endScreen.classList.contains('end-overlay')) {
      endScreen.classList.add('end-overlay');
    }
    if (endPanel) endPanel.style.display = 'block';
    shareDock.style.display = 'none';
  }

  function setOverlayModeFinal() {
    endScreen.classList.remove('hidden');
    endScreen.classList.remove('end-overlay');
    endScreen.classList.add('end-final');
    if (endPanel) endPanel.style.display = 'none';
    shareDock.style.display = 'block';
  }

  function showEndOverlayForFreshRun() {
    if (!finishStats) return;
    const dateStr = computeTodayDateStr();
    finishStats.date = dateStr;

    endTitle.innerText = "BRAVO !";
    endSummary.innerText = `Score: ${finishStats.score} | Précision: ${finishStats.accuracy}% | Date: ${dateStr}`;

    pseudoRow.classList.remove('hidden');
    saveRow.classList.remove('hidden');

    nicknameInput.value = '';
    nicknameInput.disabled = false;
    saveScoreBtn.disabled = false;
    saveScoreBtn.style.opacity = '1';

    endMessage.innerText = "Entre ton pseudo pour générer ton certificat.";
    lastShareUrl = null;

    setOverlayModeForm();
  }

  function showEndOverlayFromShared(shared) {
    finishStats = {
      score: shared.score,
      accuracy: shared.accuracy,
      nick: shared.nick,
      date: shared.date
    };

    endTitle.innerText = "CERTIFICAT DE RÉUSSITE";
    endSummary.innerText = `Pseudo: ${shared.nick} | Score: ${shared.score} | Précision: ${shared.accuracy}% | Date: ${shared.date}`;

    pseudoRow.classList.add('hidden');
    saveRow.classList.add('hidden');

    nicknameInput.disabled = true;
    saveScoreBtn.disabled = true;
    saveScoreBtn.style.opacity = '0.4';

    endMessage.innerText = "Certificat partagé. Tu peux rejouer avec START ou copier le lien.";

    lastShareUrl = window.location.href;

    setOverlayModeFinal();
  }

  function finishGame() {
    state = 'finished';
    const accuracy = (notesPassed > 0) ? Math.round((notesHit / notesPassed) * 100) : 0;
    finishStats = { score, accuracy };

    lyricDiv.innerHTML = `<div style="color:#fff; text-shadow:2px 2px #000;">FIN DE PARTIE !</div>`;
    gameBtnsDiv.classList.remove('hidden');
    startBtn.classList.add('hidden');

    if (masterGain && audioCtx) masterGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
    stopStadiumLoop();

    drawEndSplash();
    showEndOverlayForFreshRun();
  }

  // ---------------- COUNTDOWN OVERLAY (canvas) ----------------
  function drawCountdownOverlay(nowT) {
    const elapsed = nowT - countdownStart;
    const remaining = clamp(COUNTDOWN_SEC - elapsed, 0, COUNTDOWN_SEC);

    let label = "";
    if (remaining > 2.4) label = "3";
    else if (remaining > 1.55) label = "2";
    else if (remaining > 0.75) label = "1";
    else label = "GO!";

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, BASE_W, BASE_H);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "70px 'Press Start 2P'";
    ctx.fillText(label, BASE_W / 2, BASE_H / 2);

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "12px 'Press Start 2P'";
    ctx.fillText("PREPARE TA VOIX !", BASE_W / 2, BASE_H / 2 + 70);

    ctx.restore();
  }

  // ---------------- RENDER FRAME ----------------
  function renderFrame() {
    ctx.clearRect(0, 0, BASE_W, BASE_H);

    const nowAudio = audioCtx ? audioCtx.currentTime : 0;
    const tSec = (state === 'playing' || state === 'finished') ? Math.max(0, nowAudio - startTime) : 0;
    const currentBeat = (state === 'playing' || state === 'finished')
      ? (tSec / BEAT_DURATION) + firstNoteT
      : firstNoteT;

    if (beatEl) {
      const relBeat = currentBeat - firstNoteT;
      const displayBeat = relBeat > 0 ? relBeat : 0;
      beatEl.textContent = displayBeat.toFixed(1);
    }

    const scrollX = (state === 'playing' || state === 'finished') ? (currentBeat * 80) : 0;
    drawFootballPitch(scrollX, tSec);

    updateMedals();
    medals.forEach(m => drawMedal(m, tSec));

    // Rythme
    if (state === 'playing' && audioCtx) {
      const beatIdx = Math.floor(currentBeat);
      if (beatIdx > lastProcessedBeat) {
        const t = audioCtx.currentTime;
        if (isMetroEnabled) playHiHat(t);
        if (isDrumEnabled) {
          const step = beatIdx % 4;
          if (step === 0) playKick(t);
          if (step === 2) { playKick(t); playSnare(t); }
          if (step === 1 || step === 3) playSnare(t);
        }
        lastProcessedBeat = beatIdx;
      }
    }

    // Voix
    if (state === 'playing' && analyser && dataArray && audioCtx) {
      analyser.getFloatTimeDomainData(dataArray);
      const freq = detectFreqNSDF_bounded(dataArray, audioCtx.sampleRate);
      if (freq) {
        const n = 12 * Math.log2(freq / 440) + 69;
        medianBuffer.push(n);
        if (medianBuffer.length > 5) medianBuffer.shift();
        currentVocalNote = [...medianBuffer].sort((a, b) => a - b)[2];
      }
    }

    // Piano
    const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    ctx.fillStyle = "#3d2516";
    ctx.fillRect(0, 0, PIANO_WIDTH, BASE_H);
    for (let n = 36; n < 84; n++) {
      const y = noteToY(n);
      const isBlack = names[n % 12].includes("#");
      const isPressed = (currentVocalNote && isSamePitchClass(currentVocalNote, n));
      ctx.fillStyle = isPressed ? "#2ecc71" : (isBlack ? "#222" : "#fdf5e6");
      ctx.fillRect(5, y - 7, PIANO_WIDTH - 15, 14);
    }

    // Mélodie + scoring
    let activeMIDINote = null;
    let isHitting = false;

    if (state === 'playing' && audioCtx && masterGain && masterOsc && subOsc) {
      melody.forEach((note, i) => {
        const xS = (note.t - currentBeat) * PIXELS_PER_BEAT + TRIGGER_X;
        const xE = (melody[i + 1])
          ? (melody[i + 1].t - currentBeat) * PIXELS_PER_BEAT + TRIGGER_X
          : (note.t + note.d - currentBeat) * PIXELS_PER_BEAT + TRIGGER_X;

        const y = noteToY(note.n);

        if (xE > PIANO_WIDTH && xS < BASE_W) {
          ctx.fillStyle = note.validated ? "rgba(46,204,113,0.85)" : "rgba(231,76,60,0.85)";
          ctx.fillRect(xS, y - 8, xE - xS, 16);
        }

        const isActive = (
          currentBeat >= note.t &&
          (melody[i + 1] ? currentBeat < melody[i + 1].t : currentBeat < note.t + note.d)
        );

        if (isActive) {
          activeMIDINote = note;

          const timeSinceNoteStart = currentBeat - note.t; // en beats
          const isLastNote = (i === melody.length - 1);
          const sustainBeats = isLastNote ? 4.0 : 2.0;

          if (timeSinceNoteStart > sustainBeats) {
            masterGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
          } else {
            const f = midiToFreq(note.n);
            masterOsc.frequency.setTargetAtTime(f, audioCtx.currentTime, 0.02);
            subOsc.frequency.setTargetAtTime(f, audioCtx.currentTime, 0.02);
            masterGain.gain.setTargetAtTime(MELODY_ENVELOPE_GAIN, audioCtx.currentTime, 0.08);
          }

          if (isPitchAccepted(currentVocalNote, note.n)) {
            isHitting = true;
            if (!note.validated) {
              note.validated = true;
              score += 50;
              notesHit++;
              spawnTrophy(TRIGGER_X, y);
              playHitJingle(note.n);
              maybeRollBonus(TRIGGER_X, y);
            }
          }
        }

        if (!note.passed && xS < TRIGGER_X - 10) {
          note.passed = true;
          notesPassed++;
        }
      });

      if (!activeMIDINote) {
        masterGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
      }
    } else {
      if (masterGain && audioCtx) masterGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
    }

    // Animations
    for (let i = trophies.length - 1; i >= 0; i--) {
      const t = trophies[i];
      t.x += t.vx; t.y += t.vy;
      t.vy += 0.12;
      t.rot += 0.08;
      t.life -= 0.012;
      if (t.life <= 0) trophies.splice(i, 1);
      else drawTrophy(t);
    }

    drawRings();
    drawSparks();
    drawFireworks();
    drawFloatTexts(tSec);

    // Ballon
    let targetY = displayBallY;
    if (currentVocalNote) {
      let visualNote = currentVocalNote;
      if (activeMIDINote) visualNote = foldToNearestSamePitchClass(currentVocalNote, activeMIDINote.n);
      targetY = noteToY(visualNote);
    }
    displayBallY += (targetY - displayBallY) * 0.15;

    drawBall(TRIGGER_X, displayBallY, isHitting);

    // UI texte
    scoreEl.innerText = score;
    progressEl.innerText = (notesPassed > 0 ? Math.round((notesHit / notesPassed) * 100) : 0) + "%";

    if (state === 'playing') renderLyrics3Lines(currentBeat);
    if (state === 'countdown') drawCountdownOverlay(nowAudio);
    if (state === 'finished') drawEndSplash();

    return { currentBeat };
  }

  // ---------------- MAIN LOOP ----------------
  function loop() {
    if (!audioCtx && state !== 'idle') return;

    const nowAudio = audioCtx ? audioCtx.currentTime : 0;

    if (state === 'countdown') {
      renderFrame();
      const elapsed = nowAudio - countdownStart;
      if (elapsed >= COUNTDOWN_SEC) {
        state = 'playing';
        startTime = audioCtx.currentTime;
        lastProcessedBeat = -1;
      }
      requestAnimationFrame(loop);
      return;
    }

    if (state === 'playing') {
      const { currentBeat } = renderFrame();
      if (melody.length > 0 && currentBeat >= (lastNoteEndT + END_PADDING_BEATS)) {
        finishGame();
        renderFrame();
        return;
      }
      requestAnimationFrame(loop);
      return;
    }

    renderFrame();
  }

  // ---------------- RESET ----------------
  function resetRunState() {
    score = 0;
    notesPassed = 0;
    notesHit = 0;
    trophies = [];
    sparks = [];
    rings = [];
    floatTexts = [];
    fireworks = [];
    lastProcessedBeat = -1;

    medianBuffer.length = 0;
    currentVocalNote = 60;
    displayBallY = noteToY(60);
    ballRotation = 0;

    finishStats = null;
    retryCanvasButton = null;

    melody.forEach(n => {
      n.validated = false;
      n.passed = false;
    });
  }

  // ---------------- LANCEMENT RUN ----------------
  async function launchRun() {
    await initAudio();
    applyResponsiveLayout();
    setupLyricsBoxStyle();

    if (!lyricsLoaded) await loadLyricsTxt();
    if (lyricsLoaded) buildLyricsSchedule();

    resetRunState();
    applyVolumes();

    if (stadium.isLoaded) startStadiumLoop();

    state = 'countdown';
    countdownStart = audioCtx.currentTime;
    playStartCountdownJingle(countdownStart);

    endScreen.classList.add('hidden');
    endScreen.classList.remove('end-final');
    if (!endScreen.classList.contains('end-overlay')) {
      endScreen.classList.add('end-overlay');
    }
    endMessage.innerText = "";

    loop();
  }

  // ---------------- START / REPLAY / STOP ----------------
  startBtn.onclick = async () => {
    startBtn.classList.add('hidden');
    gameBtnsDiv.classList.remove('hidden');
    await launchRun();
  };

  replayBtn.onclick = async () => {
    await launchRun();
  };

  stopBtn.onclick = () => location.reload();

  // ---------------- CLIC SUR LE CANVAS (bouton RETRY) ----------------
  canvas.addEventListener('click', (ev) => {
    if (state !== 'finished' || !retryCanvasButton) return;

    const rect = canvas.getBoundingClientRect();
    // conversion coords écran -> coords logiques (BASE_W / BASE_H)
    const x = (ev.clientX - rect.left) * (BASE_W / rect.width);
    const y = (ev.clientY - rect.top) * (BASE_H / rect.height);

    const btn = retryCanvasButton;
    if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
      launchRun();
    }
  });

  // ---------------- OVERLAY EVENTS ----------------
  saveScoreBtn.addEventListener('click', () => {
    if (!finishStats) {
      endMessage.innerText = "Aucun score à enregistrer.";
      return;
    }
    let nick = nicknameInput.value.trim().toUpperCase();
    if (!nick) {
      endMessage.innerText = "Pseudo obligatoire.";
      return;
    }
    nick = nick.replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (!nick) {
      endMessage.innerText = "Utilise uniquement lettres et chiffres.";
      return;
    }
    nicknameInput.value = nick;

    if (!finishStats.date) {
      finishStats.date = computeTodayDateStr();
    }
    finishStats.nick = nick;

    const url = buildShareUrl(nick, finishStats.score, finishStats.accuracy, finishStats.date);
    lastShareUrl = url;

    endTitle.innerText = "CERTIFICAT DE RÉUSSITE";
    endSummary.innerText = `Pseudo: ${nick} | Score: ${finishStats.score} | Précision: ${finishStats.accuracy}% | Date: ${finishStats.date}`;
    endMessage.innerText = "Score enregistré ! Voici ton certificat. Tu peux maintenant copier le lien et le coller où tu veux.";

    nicknameInput.disabled = true;
    saveScoreBtn.disabled = true;
    saveScoreBtn.style.opacity = '0.5';

    pseudoRow.classList.add('hidden');
    saveRow.classList.add('hidden');

    setOverlayModeFinal();
    renderFrame();
  });

  copyUrlBtn.addEventListener('click', async () => {
    if (!finishStats) {
      endMessage.innerText = "Joue une partie avant de copier le lien.";
      return;
    }
    if (!lastShareUrl) {
      endMessage.innerText = "Enregistre d'abord ton score avec ton pseudo.";
      return;
    }

    try {
      await navigator.clipboard.writeText(lastShareUrl);
      endMessage.innerText = "Lien copié dans le presse-papiers !";
    } catch (e) {
      console.warn(e);
      endMessage.innerText = "Impossible de copier, sélectionne manuellement l'URL dans la barre d'adresse.";
    }
  });

  // ---------------- BOOT ----------------
  (async () => {
    await loadMidi();
    await loadLyricsTxt();
    if (lyricsLoaded) buildLyricsSchedule();

    applyResponsiveLayout();
    renderFrame();

    const shared = parseSharedFromUrl();
    if (shared && shared.isValid) {
      state = 'finished';
      finishStats = {
        score: shared.score,
        accuracy: shared.accuracy,
        nick: shared.nick,
        date: shared.date
      };
      lastShareUrl = window.location.href;

      renderFrame();
      showEndOverlayFromShared(shared);
    }
  })();
});
