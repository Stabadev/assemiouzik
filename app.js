document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const lyricDiv = document.getElementById('lyrics-display');

  // UI
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const replayBtn = document.getElementById('replayBtn');
  const gameBtnsDiv = document.getElementById('game-btns');
  const loadingStatus = document.getElementById('loading-status');
  const btnMetro = document.getElementById('btnMetro');
  const btnDrum = document.getElementById('btnDrum');

  // ---------------- CONFIG ----------------
  const MIDI_FILE_PATH = 'musique.mid';
  const STADIUM_FILE_PATH = 'stadium.mp3';

  // ✅ Lyrics TXT
  const LYRICS_FILE_PATH = 'lyrics.txt';
  const BEATS_PER_LYRIC_LINE = 8; // 2 mesures (4/4) = 8 beats

  // 🔉 foule
  const STADIUM_VOL = 0.065;

  // gameplay
  const PIXELS_PER_BEAT = 220;
  const NOTE_HEIGHT_UNIT = 15;
  const CENTER_NOTE = 60;
  const TRIGGER_X = 250;
  const PIANO_WIDTH = 80;
  const BPM = 120;
  const BEAT_DURATION = 60 / BPM;

  // pitch
  const MIN_FREQ = 70;
  const MAX_FREQ = 900;

  // validation octave
  const HIT_TOL = 1.5;
  const OCTAVE_SEMI = 12;
  const OCTAVE_TOL = 1.8;

  // fin
  const END_PADDING_BEATS = 2.0;

  // countdown
  const COUNTDOWN_SEC = 3.2;
  const COUNTDOWN_BEAT_BEEP = 0.42;

  // jingles
  const HIT_JINGLE_VOL = 0.06;
  const START_JINGLE_VOL = 0.10;

  // bonus
  const BONUS_50_CHANCE = 0.12;
  const BONUS_100_CHANCE = 0.05;

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

  // Ballon sur la ligne même si chanté à l'octave (repli pitch-class)
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

  // ---------------- STATE ----------------
  let melody = [];
  let firstNoteT = 0;
  let lastNoteEndT = 0;

  let score = 0, notesPassed = 0, notesHit = 0;

  let isMetroEnabled = false;
  let isDrumEnabled = false;
  let lastProcessedBeat = -1;

  let audioCtx, analyser, dataArray;
  let masterOsc, subOsc, masterGain;

  // ✅ Stadium MP3
  const stadium = {
    buffer: null,
    source: null,
    gain: null,
    isLoaded: false,
    isPlaying: false,
    loadingPromise: null
  };

  // session
  let state = 'idle'; // 'idle'|'countdown'|'playing'|'finished'
  let startTime = 0;
  let countdownStart = 0;
  let finishStats = null;

  // voice
  let currentVocalNote = 60;
  let displayBallY = noteToY(60);
  let ballRotation = 0;
  const medianBuffer = [];

  // fx
  let trophies = [];
  let sparks = [];
  let rings = [];
  let floatTexts = [];

  // 🏅 medals
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

  // ✅ Lyrics
  let lyricsRawLines = null;
  let lyricsItems = [];  // [{beat, text}]
  let lyricsLoaded = false;

  // ---------------- UI TOGGLES ----------------
  function updateToggle(btn, label, on) {
    btn.classList.toggle('btn-on', on);
    btn.classList.toggle('btn-off', !on);
    btn.textContent = `${label}: ${on ? 'ON' : 'OFF'}`;
  }
  updateToggle(btnMetro, 'METRONOME', false);
  updateToggle(btnDrum, 'BATTERIE ROCK', false);

  btnMetro.addEventListener('click', () => {
    isMetroEnabled = !isMetroEnabled;
    updateToggle(btnMetro, 'METRONOME', isMetroEnabled);
  });
  btnDrum.addEventListener('click', () => {
    isDrumEnabled = !isDrumEnabled;
    updateToggle(btnDrum, 'BATTERIE ROCK', isDrumEnabled);
  });

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

  // Règles :
  // - ligne vide => +8 beats
  // - "# ..." => ignore
  // - "~N" => pause N blocs (N*8 beats)
  // - "pause N" => idem
  // - "@BEATS texte" => placement absolu (beat = firstNoteT + BEATS)
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
        const n = parseInt(mPause1[1], 10) || 1;
        beatCursor += n * BEATS_PER_LYRIC_LINE;
        continue;
      }

      const mPause2 = trimmed.match(/^pause\s*(\d+)?\s*$/i);
      if (mPause2) {
        const n = mPause2[1] ? (parseInt(mPause2[1], 10) || 1) : 1;
        beatCursor += n * BEATS_PER_LYRIC_LINE;
        continue;
      }

      const mAbs = trimmed.match(/^@(\d+)\s+(.*)$/);
      if (mAbs) {
        const abs = parseInt(mAbs[1], 10) || 0;
        const txt = (mAbs[2] || '').trim();
        if (txt.length > 0) {
          const beat = firstNoteT + abs;
          lyricsItems.push({ beat, text: txt });
        }
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
    let lo = 0, hi = lyricsItems.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lyricsItems[mid].beat <= currentBeat) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  }

  // ✅ NOUVEAU : 3 lignes = précédente (gris) / actuelle (blanc) / suivante (gris->blanc transition)
  // Transition : la ligne suivante "blanchit" progressivement pendant les 8 beats de la ligne actuelle.
  function renderLyrics3Lines(currentBeat) {
    if (!lyricsLoaded || !lyricsItems || lyricsItems.length === 0) return;

    const idx = findCurrentLyricIndex(currentBeat);

    const prevText = (idx > 0) ? (lyricsItems[idx - 1]?.text || "") : "";
    const curText  = (idx >= 0) ? (lyricsItems[idx]?.text || "") : "";
    const nextText = (idx >= 0) ? (lyricsItems[idx + 1]?.text || "") : (lyricsItems[0]?.text || "");

    // progression intra-bloc sur 8 beats
    let prog = 0;
    if (idx >= 0) {
      const curBeat0 = lyricsItems[idx].beat;
      prog = clamp((currentBeat - curBeat0) / BEATS_PER_LYRIC_LINE, 0, 1);
    }

    // couleur suivante (gris -> blanc)
    const nextAlpha = 0.35 + 0.65 * prog;  // 0.35 -> 1.0
    const nextGlow  = 0.15 + 0.45 * prog;  // glow léger qui monte

    const prevHtml = prevText
      ? `<div style="color:rgba(255,255,255,0.42); text-shadow:2px 2px #000;">${escapeHtml(prevText)}</div>`
      : `<div style="color:rgba(255,255,255,0.14); text-shadow:2px 2px #000;"> </div>`;

    const curHtml = curText
      ? `<div style="color:#ffffff; text-shadow:2px 2px #000; font-weight:700;">${escapeHtml(curText)}</div>`
      : `<div style="color:rgba(255,255,255,0.65); text-shadow:2px 2px #000;">...</div>`;

    const nextHtml = nextText
      ? `<div style="
            color:rgba(255,255,255,${nextAlpha.toFixed(3)});
            text-shadow:2px 2px #000, 0 0 10px rgba(255,255,255,${nextGlow.toFixed(3)});
          ">${escapeHtml(nextText)}</div>`
      : `<div style="color:rgba(255,255,255,0.14); text-shadow:2px 2px #000;"> </div>`;

    lyricDiv.innerHTML = prevHtml + curHtml + nextHtml;
  }

  // ---------------- AUDIO INIT ----------------
  async function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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
      masterGain.connect(audioCtx.destination);
      masterGain.gain.value = 0;

      masterOsc.start();
      subOsc.start();
    }
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    await ensureStadiumLoaded();
  }

  // ---------------- STADIUM MP3 ----------------
  async function ensureStadiumLoaded() {
    if (stadium.isLoaded) return;
    if (stadium.loadingPromise) return stadium.loadingPromise;

    stadium.loadingPromise = (async () => {
      try {
        if (!stadium.gain) {
          stadium.gain = audioCtx.createGain();
          stadium.gain.gain.value = STADIUM_VOL;
          stadium.gain.connect(audioCtx.destination);
        }
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
    if (!audioCtx || !stadium.isLoaded) return;
    if (stadium.isPlaying) return;

    stopStadiumLoop();

    const src = audioCtx.createBufferSource();
    src.buffer = stadium.buffer;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = stadium.buffer.duration;
    src.connect(stadium.gain);

    const t = audioCtx.currentTime;
    stadium.gain.gain.cancelScheduledValues(t);
    stadium.gain.gain.setValueAtTime(0.0001, t);
    stadium.gain.gain.exponentialRampToValueAtTime(STADIUM_VOL, t + 0.40);

    src.start(t);
    stadium.source = src;
    stadium.isPlaying = true;

    src.onended = () => {
      if (stadium.source === src) stadium.isPlaying = false;
    };
  }

  function stopStadiumLoop() {
    if (!audioCtx) return;

    const t = audioCtx.currentTime;
    if (stadium.gain) {
      stadium.gain.gain.cancelScheduledValues(t);
      stadium.gain.gain.setValueAtTime(stadium.gain.gain.value || STADIUM_VOL, t);
      stadium.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    }

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
    const now = audioCtx.currentTime;
    if (now - lastHitJingleAt < 0.06) return;
    lastHitJingleAt = now;

    const f = midiToFreq(midiNote);
    playTone(f * 2, now, 0.08, 'square', HIT_JINGLE_VOL);
    playTone(f * 2.5, now + 0.03, 0.10, 'triangle', HIT_JINGLE_VOL * 0.8);
  }

  // ---------------- DRUMS ----------------
  function playKick(t) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(0.01, t + 0.5);
    g.gain.setValueAtTime(0.8, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
    o.connect(g); g.connect(audioCtx.destination);
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
    src.connect(g); g.connect(audioCtx.destination);
    src.start(t);
  }

  function playHiHat(t) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(10000, t);
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
    o.connect(g); g.connect(audioCtx.destination);
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
    const W = canvas.width;
    const H = canvas.height;

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

    const boxH = 220;
    const boxW = 140;

    ctx.strokeRect(12, (H - boxH) / 2, boxW, boxH);
    ctx.strokeRect(12, (H - 120) / 2, 60, 120);
    ctx.beginPath();
    ctx.arc(12 + 95, H / 2, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeRect(W - 12 - boxW, (H - boxH) / 2, boxW, boxH);
    ctx.strokeRect(W - 12 - 60, (H - 120) / 2, 60, 120);
    ctx.beginPath();
    ctx.arc(W - 12 - 95, H / 2, 3.5, 0, Math.PI * 2);
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
    const scale = 1.0 + 0.03 * Math.sin(tSec * 2.8 + m.phase);

    ctx.save();
    ctx.translate(m.x, m.y + bounce);
    ctx.rotate(rot);
    ctx.scale(scale, scale);

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

    ctx.fillStyle = "rgba(255,170,40,0.9)";
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(2, -1);
    ctx.lineTo(5, -1);
    ctx.lineTo(3, 1);
    ctx.lineTo(4, 4);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4, 4);
    ctx.lineTo(-3, 1);
    ctx.lineTo(-5, -1);
    ctx.lineTo(-2, -1);
    ctx.closePath();
    ctx.fill();

    const sx = (m.shine * 30) - 15;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.25 * glow;
    ctx.translate(sx, -2);
    ctx.rotate(-0.5);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillRect(-2, -14, 4, 28);
    ctx.restore();

    if (m.blink > 0) {
      ctx.globalAlpha = m.blink;
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, -8);
      ctx.lineTo(10, -12);
      ctx.stroke();
    }

    ctx.restore();
  }

  function spawnSparks(x, y) {
    const count = 22;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 4.5;
      sparks.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1.5,
        life: 1.0,
        size: 1.5 + Math.random() * 2.5
      });
    }
  }

  function spawnRingExplosion(x, y) {
    rings.push({ x, y, r: 6,  vr: 7.5,  life: 1.0, lw: 4.5 });
    rings.push({ x, y, r: 2,  vr: 10.0, life: 0.9, lw: 2.8 });
  }

  function spawnTrophy(x, y) {
    trophies.push({
      x, y,
      vy: -Math.random() * 2 - 2.2,
      vx: -1.6,
      life: 1.0,
      rot: 0,
      scale: 1.5 + Math.random() * 0.3
    });
    spawnSparks(x, y);
    spawnRingExplosion(x, y);
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
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.vx *= 0.99;
      p.life -= 0.03;

      if (p.life <= 0) { sparks.splice(i, 1); continue; }

      ctx.save();
      ctx.globalAlpha = p.life;
      const hue = 40 + Math.random() * 20;
      ctx.strokeStyle = hsl(hue, 90, 60);
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

  function spawnFloatText(txt, x, y, kind = 'bonus') {
    floatTexts.push({
      txt, x, y,
      vy: -1.6,
      life: 1.0,
      kind,
      wobble: Math.random() * Math.PI * 2
    });
  }

  function drawFloatTexts(tSec) {
    for (let i = floatTexts.length - 1; i >= 0; i--) {
      const ft = floatTexts[i];
      ft.y += ft.vy;
      ft.x += Math.sin(tSec * 6 + ft.wobble) * 0.25;
      ft.life -= 0.02;

      if (ft.life <= 0) { floatTexts.splice(i, 1); continue; }

      ctx.save();
      ctx.globalAlpha = ft.life;
      ctx.textAlign = "center";
      ctx.font = "12px 'Press Start 2P'";
      if (ft.kind === 'bonus100') ctx.fillStyle = "#f1c40f";
      else if (ft.kind === 'bonus50') ctx.fillStyle = "#2ecc71";
      else ctx.fillStyle = "#ffffff";
      ctx.fillText(ft.txt, ft.x, ft.y);
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
      spawnRingExplosion(x, y);
      spawnSparks(x, y);
      if (bonus === 100) spawnFloatText("+100", x + 70, y - 10, "bonus100");
      else spawnFloatText("+50", x + 70, y - 10, "bonus50");
    }
  }

  function drawEndSplash() {
    if (!finishStats) return;
    const W = canvas.width;
    const H = canvas.height;

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.fillRect(110, 70, W - 220, H - 140);

    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 4;
    ctx.strokeRect(110, 70, W - 220, H - 140);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "44px 'Press Start 2P'";
    ctx.fillText("BRAVO !", W / 2, 150);

    ctx.fillStyle = "#f1c40f";
    ctx.font = "18px 'Press Start 2P'";
    ctx.fillText(`SCORE: ${finishStats.score}`, W / 2, 230);

    ctx.fillStyle = "#2ecc71";
    ctx.font = "14px 'Press Start 2P'";
    ctx.fillText(`PRECISION: ${finishStats.accuracy}%`, W / 2, 275);

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "12px 'Press Start 2P'";
    ctx.fillText("RETRY POUR REJOUER", W / 2, 335);

    ctx.restore();
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
  }

  // ---------------- COUNTDOWN OVERLAY ----------------
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
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "70px 'Press Start 2P'";
    ctx.fillText(label, canvas.width / 2, canvas.height / 2);

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "12px 'Press Start 2P'";
    ctx.fillText("PREPARE TA VOIX !", canvas.width / 2, canvas.height / 2 + 70);

    ctx.restore();
  }

  // ---------------- RENDER FRAME ----------------
  function renderFrame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const nowAudio = audioCtx ? audioCtx.currentTime : 0;
    const tSec = (state === 'playing' || state === 'finished')
      ? Math.max(0, nowAudio - startTime)
      : 0;

    const currentBeat = (state === 'playing' || state === 'finished')
      ? (tSec / BEAT_DURATION) + firstNoteT
      : firstNoteT;

    const scrollX = (state === 'playing' || state === 'finished') ? (currentBeat * 80) : 0;
    drawFootballPitch(scrollX, tSec);

    // medals
    updateMedals();
    for (const m of medals) drawMedal(m, tSec);

    // rythme
    if (state === 'playing') {
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

    // analyse voix
    if (state === 'playing') {
      analyser.getFloatTimeDomainData(dataArray);
      const freq = detectFreqNSDF_bounded(dataArray, audioCtx.sampleRate);
      if (freq) {
        const n = 12 * Math.log2(freq / 440) + 69;
        medianBuffer.push(n);
        if (medianBuffer.length > 5) medianBuffer.shift();
        currentVocalNote = [...medianBuffer].sort((a, b) => a - b)[2];
      }
    }

    // piano pitch-class
    const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    ctx.fillStyle = "#3d2516";
    ctx.fillRect(0, 0, PIANO_WIDTH, canvas.height);

    for (let n = 36; n < 84; n++) {
      const y = noteToY(n);
      const isBlack = names[n % 12].includes("#");
      const isPressed = (currentVocalNote && isSamePitchClass(currentVocalNote, n));
      ctx.fillStyle = isPressed ? "#2ecc71" : (isBlack ? "#222" : "#fdf5e6");
      ctx.fillRect(5, y - 7, PIANO_WIDTH - 15, 14);
    }

    // melody + scoring
    let activeMIDINote = null;
    let isHitting = false;

    if (state === 'playing') {
      melody.forEach((note, i) => {
        const xS = (note.t - currentBeat) * PIXELS_PER_BEAT + TRIGGER_X;
        const xE = (melody[i + 1])
          ? (melody[i + 1].t - currentBeat) * PIXELS_PER_BEAT + TRIGGER_X
          : (note.t + note.d - currentBeat) * PIXELS_PER_BEAT + TRIGGER_X;

        const y = noteToY(note.n);

        if (xE > PIANO_WIDTH && xS < canvas.width) {
          ctx.fillStyle = note.validated ? "rgba(46,204,113,0.85)" : "rgba(231,76,60,0.85)";
          ctx.fillRect(xS, y - 8, xE - xS, 16);
        }

        const isActive = (currentBeat >= note.t && (melody[i + 1] ? currentBeat < melody[i + 1].t : currentBeat < note.t + note.d));

        if (isActive) {
          activeMIDINote = note;

          const timeSinceNoteStart = currentBeat - note.t;
          if (timeSinceNoteStart > 2.0) {
            masterGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
          } else {
            const f = midiToFreq(note.n);
            masterOsc.frequency.setTargetAtTime(f, audioCtx.currentTime, 0.02);
            subOsc.frequency.setTargetAtTime(f, audioCtx.currentTime, 0.02);
            masterGain.gain.setTargetAtTime(0.12, audioCtx.currentTime, 0.1);
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

      if (!activeMIDINote) masterGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
    } else {
      if (masterGain && audioCtx) masterGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
    }

    // fx
    for (let i = trophies.length - 1; i >= 0; i--) {
      const t = trophies[i];
      t.x += t.vx;
      t.y += t.vy;
      t.vy += 0.12;
      t.rot += 0.08;
      t.life -= 0.012;
      if (t.life <= 0) trophies.splice(i, 1);
      else drawTrophy(t);
    }
    drawRings();
    drawSparks();
    drawFloatTexts(tSec);

    // ballon
    let targetY = displayBallY;
    if (currentVocalNote) {
      let visualNote = currentVocalNote;
      if (activeMIDINote) visualNote = foldToNearestSamePitchClass(currentVocalNote, activeMIDINote.n);
      targetY = noteToY(visualNote);
    }
    displayBallY += (targetY - displayBallY) * 0.15;

    ctx.save();
    ctx.translate(TRIGGER_X, displayBallY);
    if (isHitting) { ballRotation += 0.2; ctx.rotate(ballRotation); }
    ctx.fillStyle = "white"; ctx.fillRect(-10, -10, 20, 20);
    ctx.fillStyle = "black"; ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();

    // UI values
    document.getElementById('score-val').innerText = score;
    document.getElementById('progress-val').innerText =
      (notesPassed > 0 ? Math.round((notesHit / notesPassed) * 100) : 0) + "%";

    // ✅ lyrics (prev / current / next with transition)
    if (state === 'playing') {
      renderLyrics3Lines(currentBeat);
    }

    // overlays
    if (state === 'countdown') drawCountdownOverlay(nowAudio);
    if (state === 'finished') drawEndSplash();

    return { currentBeat };
  }

  // ---------------- MAIN LOOP ----------------
  function loop() {
    if (!audioCtx) return;

    const nowAudio = audioCtx.currentTime;

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
    score = 0; notesPassed = 0; notesHit = 0;
    trophies = []; sparks = []; rings = []; floatTexts = [];
    lastProcessedBeat = -1;

    medianBuffer.length = 0;
    currentVocalNote = 60;
    displayBallY = noteToY(60);
    ballRotation = 0;

    finishStats = null;

    melody.forEach(n => { n.validated = false; n.passed = false; });
  }

  // ---------------- START / REPLAY ----------------
  startBtn.onclick = async () => {
    await initAudio();

    setupLyricsBoxStyle();

    if (!lyricsLoaded) await loadLyricsTxt();
    if (lyricsLoaded) buildLyricsSchedule();

    resetRunState();

    startBtn.classList.add('hidden');
    gameBtnsDiv.classList.remove('hidden');

    if (stadium.isLoaded) startStadiumLoop();

    state = 'countdown';
    countdownStart = audioCtx.currentTime;
    playStartCountdownJingle(countdownStart);

    lyricDiv.innerHTML =
      `<div style="color:rgba(255,255,255,0.42); text-shadow:2px 2px #000;"> </div>
       <div style="color:#fff; text-shadow:2px 2px #000; font-weight:700;">READY...</div>
       <div style="color:rgba(255,255,255,0.35); text-shadow:2px 2px #000;"> </div>`;

    loop();
  };

  replayBtn.onclick = async () => {
    await initAudio();

    setupLyricsBoxStyle();

    if (!lyricsLoaded) await loadLyricsTxt();
    if (lyricsLoaded) buildLyricsSchedule();

    resetRunState();

    if (stadium.isLoaded) startStadiumLoop();

    state = 'countdown';
    countdownStart = audioCtx.currentTime;
    playStartCountdownJingle(countdownStart);

    loop();
  };

  stopBtn.onclick = () => location.reload();

  // ---------------- BOOT ----------------
  (async () => {
    await loadMidi();
    await loadLyricsTxt();
    if (lyricsLoaded) buildLyricsSchedule();
  })();
});
