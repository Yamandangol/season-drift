// All sound is synthesised with the Web Audio API (no asset files):
//  - a layered engine with gear shifts, intake noise and turbo whistle
//  - tyre sounds: road roll, surface crunch (snow / leaves / mud / water) and skid squeal
//  - per-season ambience (spring birds, summer cicadas, autumn wind, winter blizzard)
//  - a per-season music loop with pads, bass, melody and drums
//  - one-shot effects, with a shared reverb for space
// The AudioContext only starts after the first click / key press (browser rule).

const MUTE_KEY = 'fsr.mute';

// Scales (semitones from root) and tempo per season: Spring, Summer, Autumn, Winter, Start line.
const SCALES: number[][] = [
  [0, 2, 4, 7, 9, 12],   // spring: bright major pentatonic
  [0, 4, 5, 7, 11, 12],  // summer: lydian-ish, sunny
  [0, 3, 5, 7, 10, 12],  // autumn: minor pentatonic, warm
  [0, 2, 3, 7, 8, 12],   // winter: cold, sparse
  [0, 4, 7, 9, 12, 14],  // start line
];
const ROOTS = [60, 62, 57, 64, 60];
const BPM = [128, 140, 112, 96, 120];
// chord progression per season (scale degrees of the chord roots, one per bar)
const PROG: number[][] = [
  [0, 5, 3, 4],
  [0, 3, 4, 3],
  [0, 3, 2, 4],
  [0, 4, 0, 3],
  [0, 3, 4, 2],
];
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** gear bands as fractions of top speed */
const GEARS = [0, 0.2, 0.42, 0.66, 0.9];

export interface DriveState {
  speed01: number; // |speed| / top speed
  throttle: boolean;
  slip: number; // sideways speed (u/s)
  surface: string;
  stalled: boolean;
  boost?: boolean;
}

type Voice = { src: AudioScheduledSourceNode; gain: GainNode; filter?: BiquadFilterNode; extra?: AudioNode[] };

export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private ambBus!: GainNode;
  private verbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  muted = false;

  // engine
  private engOsc: OscillatorNode[] = [];
  private engGain: GainNode | null = null;
  private engFilter: BiquadFilterNode | null = null;
  private engShaper: WaveShaperNode | null = null;
  private intake: Voice | null = null;
  private whistle: Voice | null = null;
  private engOn = false;
  private gear = 0;
  private shiftDip = 0;

  // tyres
  private roll: Voice | null = null;
  private crunch: Voice | null = null;
  private skid: Voice | null = null;

  // ambience
  private amb: Voice | null = null;
  private ambSeason = -1;
  private ambTimer = 0;
  private ambOn = false;

  // music
  private season = 4;
  private musicOn = false;
  private musicTimer = 0;
  private nextNote = 0;
  private step = 0;
  private racing = false;

  constructor() {
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* ignore */ }
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 1.35;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(c.destination);

      // shared reverb (generated impulse: decaying stereo noise)
      const verb = c.createConvolver();
      const secs = 1.6, len = Math.floor(c.sampleRate * secs);
      const ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      verb.buffer = ir;
      const verbOut = c.createGain();
      verbOut.gain.value = 0.35;
      this.verbSend = c.createGain();
      this.verbSend.connect(verb).connect(verbOut).connect(this.master);

      this.sfxBus = c.createGain();
      this.sfxBus.gain.value = 0.9 * this.sfxVol;
      this.sfxBus.connect(this.master);
      const sfxVerb = c.createGain();
      sfxVerb.gain.value = 0.25;
      this.sfxBus.connect(sfxVerb).connect(this.verbSend);

      this.musicBus = c.createGain();
      this.musicBus.gain.value = 0.16;
      this.musicBus.connect(this.master);
      const musVerb = c.createGain();
      musVerb.gain.value = 0.6;
      this.musicBus.connect(musVerb).connect(this.verbSend);

      this.ambBus = c.createGain();
      this.ambBus.gain.value = 0;
      this.ambBus.connect(this.master);

      const nlen = c.sampleRate * 2;
      this.noiseBuf = c.createBuffer(1, nlen, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < nlen; i++) d[i] = Math.random() * 2 - 1;
      if (this.musicOn) this.startMusic();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* ignore */ }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1.35, this.ctx.currentTime, 0.05);
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private get ready(): AudioContext | null {
    return this.ctx && this.ctx.state === 'running' && !this.muted ? this.ctx : null;
  }

  // ---------- building blocks ----------
  private tone(freq: number, dur: number, o: { type?: OscillatorType; vol?: number; slide?: number; delay?: number; attack?: number; bus?: AudioNode; pan?: number; detune?: number } = {}) {
    const c = this.ready;
    if (!c) return;
    const { type = 'sine', vol = 0.3, slide = 0, delay = 0, attack = 0.005 } = o;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (o.detune) osc.detune.value = o.detune;
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let out: AudioNode = g;
    if (o.pan) {
      const p = c.createStereoPanner();
      p.pan.value = o.pan;
      out = g.connect(p);
    }
    osc.connect(g);
    out.connect(o.bus ?? this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, o: { vol?: number; freq?: number; q?: number; type?: BiquadFilterType; sweep?: number; delay?: number; attack?: number; bus?: AudioNode; pan?: number } = {}) {
    const c = this.ready;
    if (!c) return;
    const { vol = 0.3, freq = 1500, q = 0.8, type = 'bandpass', sweep = 1, delay = 0, attack = 0.01 } = o;
    const t0 = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0);
    if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let out: AudioNode = g;
    if (o.pan) {
      const p = c.createStereoPanner();
      p.pan.value = o.pan;
      out = g.connect(p);
    }
    src.connect(f).connect(g);
    out.connect(o.bus ?? this.sfxBus);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  /** a looping filtered-noise voice whose gain/filter we drive every frame */
  private loopNoise(type: BiquadFilterType, freq: number, q: number, bus: AudioNode): Voice {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = c.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(bus);
    src.start(0, Math.random());
    return { src, gain, filter };
  }

  // ---------- engine + tyres ----------
  private startEngine() {
    const c = this.ctx;
    if (!c || this.engOn) return;
    this.engOn = true;
    // three detuned voices (fundamental, slightly-off saw, sub square) into a soft-clip and a lowpass
    const types: OscillatorType[] = ['sawtooth', 'sawtooth', 'square'];
    const mix = c.createGain();
    mix.gain.value = 0.5;
    this.engOsc = types.map((t, i) => {
      const o = c.createOscillator();
      o.type = t;
      if (i === 1) o.detune.value = 9;
      const g = c.createGain();
      g.gain.value = i === 2 ? 0.45 : 0.5;
      o.connect(g).connect(mix);
      o.start();
      return o;
    });
    this.engShaper = c.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = (i / 255) * 2 - 1; curve[i] = Math.tanh(x * 2.2); }
    this.engShaper.curve = curve;
    this.engFilter = c.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 500;
    this.engFilter.Q.value = 2;
    this.engGain = c.createGain();
    this.engGain.gain.value = 0;
    mix.connect(this.engShaper).connect(this.engFilter).connect(this.engGain).connect(this.sfxBus);

    this.intake = this.loopNoise('bandpass', 900, 1.2, this.sfxBus);
    // turbo whistle: a quiet sine that rises with revs
    const w = c.createOscillator();
    w.type = 'sine';
    const wg = c.createGain();
    wg.gain.value = 0;
    w.connect(wg).connect(this.sfxBus);
    w.start();
    this.whistle = { src: w, gain: wg };

    this.roll = this.loopNoise('lowpass', 300, 0.7, this.sfxBus);
    this.crunch = this.loopNoise('bandpass', 1200, 0.9, this.sfxBus);
    this.skid = this.loopNoise('bandpass', 2600, 6, this.sfxBus);
  }

  /** Drive the engine and tyre sounds from the player's car, every frame. loud: 0..1 overall (0 = silent). */
  drive(s: DriveState, loud: number) {
    const c = this.ctx;
    if (!c) return;
    if (!this.engOn) this.startEngine();
    if (!this.engGain || !this.engFilter) return;
    const t = c.currentTime;
    const sp = Math.max(0, Math.min(1.3, s.speed01));
    const m = this.muted ? 0 : loud;

    // gears: revs climb within each band, then drop on the shift
    let g = 0;
    for (let i = 0; i < GEARS.length; i++) if (sp >= GEARS[i]) g = i;
    if (g > this.gear && s.throttle) this.shiftDip = 0.12; // a short lift on the up-shift
    this.gear = g;
    const lo = GEARS[g], hi = GEARS[g + 1] ?? 1.3;
    const inGear = Math.min(1, (sp - lo) / (hi - lo));
    const rpm = s.stalled ? 0 : 0.25 + inGear * 0.75 * (0.75 + g * 0.06) + (s.throttle ? 0.05 : 0);
    this.shiftDip = Math.max(0, this.shiftDip - 1 / 60);
    const f = 48 + rpm * 120 + g * 8;
    this.engOsc[0].frequency.setTargetAtTime(f, t, 0.04);
    this.engOsc[1].frequency.setTargetAtTime(f, t, 0.04);
    this.engOsc[2].frequency.setTargetAtTime(f * 0.5, t, 0.04);
    this.engFilter.frequency.setTargetAtTime(220 + rpm * 1100 + (s.throttle ? 500 : 0), t, 0.05);
    const vol = s.stalled ? 0.015 : (0.05 + rpm * 0.07 + (s.throttle ? 0.035 : 0)) * (this.shiftDip > 0 ? 0.45 : 1);
    this.engGain.gain.setTargetAtTime(vol * m, t, 0.05);
    if (this.intake?.filter) {
      this.intake.filter.frequency.setTargetAtTime(500 + rpm * 1800, t, 0.05);
      this.intake.gain.gain.setTargetAtTime((s.throttle && !s.stalled ? 0.03 + rpm * 0.04 : 0.005) * m, t, 0.06);
    }
    if (this.whistle) {
      (this.whistle.src as OscillatorNode).frequency.setTargetAtTime(1800 + sp * 2600, t, 0.1);
      this.whistle.gain.gain.setTargetAtTime((s.throttle && sp > 0.4 ? 0.006 + sp * 0.006 : 0) * m + (s.boost ? 0.03 * m : 0), t, 0.15);
    }

    // tyres: road roll always; a surface layer on snow / leaves / mud / water / grass; squeal when sliding
    const moving = Math.min(1, sp * 1.6);
    if (this.roll?.filter) {
      this.roll.filter.frequency.setTargetAtTime(160 + sp * 500, t, 0.1);
      this.roll.gain.gain.setTargetAtTime(moving * 0.05 * m, t, 0.1);
    }
    if (this.crunch?.filter) {
      const SURF: Record<string, [number, number, number]> = { // freq, q, vol
        snow: [700, 0.6, 0.12], leaves: [2400, 0.8, 0.09], mud: [260, 1.2, 0.14], puddle: [3800, 0.5, 0.1],
        grass: [1600, 0.7, 0.06], ice: [5000, 2, 0.03], lakeIce: [5000, 2, 0.03],
      };
      const sv = SURF[s.surface];
      if (sv) {
        this.crunch.filter.frequency.setTargetAtTime(sv[0] * (0.8 + sp * 0.4), t, 0.05);
        this.crunch.filter.Q.setTargetAtTime(sv[1], t, 0.05);
      }
      this.crunch.gain.gain.setTargetAtTime((sv ? sv[2] * moving : 0) * m, t, 0.06);
    }
    if (this.skid?.filter) {
      const slip = Math.max(0, Math.abs(s.slip) - 3);
      const icy = s.surface === 'ice' || s.surface === 'lakeIce' || s.surface === 'puddle';
      const amt = Math.min(1, slip / 10) * (icy ? 0.35 : 1);
      this.skid.filter.frequency.setTargetAtTime(icy ? 4500 : 2300 + slip * 40, t, 0.05);
      this.skid.gain.gain.setTargetAtTime(amt * 0.09 * m, t, 0.04);
    }
  }

  /** kept for compatibility: simple engine control */
  engine(speed01: number, throttle: boolean, loud: number) {
    this.drive({ speed01, throttle, slip: 0, surface: 'road', stalled: false }, loud);
  }

  engineOff() {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    for (const v of [this.engGain, this.intake?.gain, this.whistle?.gain, this.roll?.gain, this.crunch?.gain, this.skid?.gain]) v?.gain.setTargetAtTime(0, t, 0.1);
  }

  // ---------- ambience ----------
  /** season 0..3 (4 = start line / menu); on = racing */
  ambience(season: number, on: boolean) {
    const c = this.ctx;
    if (!c) return;
    if (!this.amb) this.amb = this.loopNoise('bandpass', 800, 0.5, this.ambBus);
    const t = c.currentTime;
    this.ambBus.gain.setTargetAtTime(on && !this.muted ? this.sfxVol : 0, t, 0.5);
    this.ambOn = on;
    if (season !== this.ambSeason) {
      this.ambSeason = season;
      // base bed per season: freq, q, vol
      const BED: [number, number, number][] = [[1800, 0.4, 0.025], [5200, 3, 0.012], [500, 0.8, 0.05], [900, 1.5, 0.06], [600, 0.5, 0.01]];
      const [f, q, v] = BED[Math.min(4, season)];
      this.amb.filter!.frequency.setTargetAtTime(f, t, 0.6);
      this.amb.filter!.Q.setTargetAtTime(q, t, 0.6);
      this.amb.gain.gain.setTargetAtTime(v, t, 0.6);
    }
    // occasional seasonal details
    if (!on || this.muted) return;
    this.ambTimer -= 1 / 60;
    if (this.ambTimer > 0) return;
    const pan = Math.random() * 1.6 - 0.8;
    switch (season) {
      case 0: { // spring birds: quick chirps
        const base = 2600 + Math.random() * 1600;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.tone(base, 0.07, { type: 'sine', vol: 0.045, slide: 1.3 + Math.random() * 0.3, delay: i * 0.1, pan, bus: this.ambBus });
        this.ambTimer = 1.2 + Math.random() * 2;
        break;
      }
      case 1: { // summer cicadas: buzzy pulse bursts
        for (let i = 0; i < 10; i++) this.noise(0.05, { vol: 0.02, freq: 6000, q: 8, delay: i * 0.06, pan, bus: this.ambBus, attack: 0.005 });
        this.ambTimer = 1.5 + Math.random() * 2.5;
        break;
      }
      case 2: // autumn: a wind gust swelling past
        this.noise(2.2, { vol: 0.07, freq: 350, sweep: 2.2, q: 1.2, attack: 0.9, pan, bus: this.ambBus });
        this.ambTimer = 3 + Math.random() * 3;
        break;
      case 3: // winter: a howling blizzard whistle
        this.noise(2.6, { vol: 0.06, freq: 700, sweep: 1.8, q: 9, attack: 1, pan, bus: this.ambBus });
        this.ambTimer = 2.5 + Math.random() * 3;
        break;
      default:
        this.ambTimer = 2;
    }
  }

  // ---------- music ----------
  setSeason(i: number) {
    this.season = Math.max(0, Math.min(4, i));
  }

  startMusic() {
    this.musicOn = true;
    const c = this.ctx;
    if (!c || this.musicTimer) return;
    this.nextNote = c.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.schedule(), 80);
  }

  stopMusic() {
    this.musicOn = false;
    if (this.musicTimer) window.clearInterval(this.musicTimer);
    this.musicTimer = 0;
  }

  /** race = driving (drums, fuller); otherwise a calm menu loop */
  musicLevel(race: boolean) {
    this.racing = race;
    if (this.ctx) this.musicBus.gain.setTargetAtTime((race ? 0.15 : 0.13) * this.musicVol, this.ctx.currentTime, 0.4);
  }

  private musicVol = 0.8;
  private sfxVol = 1;
  /** settings sliders, 0..1 */
  setVolumes(music: number, sfx: number) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (!this.ctx) return;
    this.sfxBus.gain.setTargetAtTime(0.9 * sfx, this.ctx.currentTime, 0.05);
    this.ambBus.gain.setTargetAtTime(this.ambOn && !this.muted ? sfx : 0, this.ctx.currentTime, 0.05);
  }

  private kick(at: number) {
    const c = this.ready;
    if (!c) return;
    const t0 = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(140, t0);
    o.frequency.exponentialRampToValueAtTime(42, t0 + 0.14);
    g.gain.setValueAtTime(0.9, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
    o.connect(g).connect(this.musicBus);
    o.start(t0);
    o.stop(t0 + 0.25);
  }

  private pad(midi: number[], dur: number, at: number, bright: number) {
    const c = this.ready;
    if (!c) return;
    const t0 = c.currentTime + at;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600 + bright * 1400;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.12, t0 + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    f.connect(g).connect(this.musicBus);
    for (const m of midi) for (const det of [-7, 7]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(m);
      o.detune.value = det;
      o.connect(f);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    }
  }

  private schedule() {
    const c = this.ctx;
    if (!c || !this.musicOn) return;
    while (this.nextNote < c.currentTime + 0.3) {
      const sea = this.season;
      const beat = 60 / BPM[sea] / 2; // eighth notes
      const sc = SCALES[sea];
      const root = ROOTS[sea];
      const st = this.step++;
      const at = this.nextNote - c.currentTime;
      const bar = Math.floor(st / 8) % 4;
      const deg = PROG[sea][bar] % (sc.length - 1);
      const chordRoot = root + sc[deg];
      if (!this.muted) {
        // pad chord at the start of every bar
        if (st % 8 === 0) {
          const third = sc[(deg + 2) % (sc.length - 1)] - sc[deg];
          const fifth = sc[(deg + 3) % (sc.length - 1)] - sc[deg];
          this.pad([chordRoot - 12, chordRoot - 12 + ((third + 12) % 12), chordRoot - 12 + ((fifth + 12) % 12)], beat * 8, at, sea === 3 ? 0.1 : sea === 1 ? 0.8 : 0.4);
        }
        // bass: root on the beat, octave bounce on the off-beat
        if (st % 2 === 0) this.tone(mtof(chordRoot - 24 + (st % 4 === 2 ? 12 : 0)), beat * 1.6, { type: 'triangle', vol: 0.45, delay: at, bus: this.musicBus, attack: 0.01 });
        // arpeggio / melody
        const pat = [0, 2, 4, 2, 3, 5, 4, 1];
        const idx = (pat[st % 8] + (Math.floor(st / 32) % 2)) % sc.length;
        const isWinter = sea === 3;
        if (!isWinter || st % 2 === 0) {
          this.tone(mtof(root + sc[idx] + (sea === 1 ? 12 : 0)), beat * (isWinter ? 2.2 : 1.1), {
            type: isWinter ? 'sine' : sea === 1 ? 'square' : 'triangle', vol: sea === 1 ? 0.14 : 0.26, delay: at, bus: this.musicBus,
          });
        }
        // drums only while racing
        if (this.racing) {
          if (st % 4 === 0 && !(isWinter && st % 8 === 4)) this.kick(at);
          if (st % 8 === 4 && !isWinter) this.noise(0.16, { vol: 0.12, freq: 1800, q: 0.7, delay: at, bus: this.musicBus }); // snare
          if (st % 2 === 1) this.noise(0.035, { vol: isWinter ? 0.03 : 0.06, freq: 8000, type: 'highpass', delay: at, bus: this.musicBus });
        } else if (st % 2 === 1 && !isWinter) this.noise(0.04, { vol: 0.04, freq: 7000, type: 'highpass', delay: at, bus: this.musicBus });
      }
      this.nextNote += beat;
    }
  }

  // ---------- one-shots ----------
  beep(high = false) {
    this.tone(high ? 880 : 440, high ? 0.6 : 0.2, { type: 'square', vol: high ? 0.2 : 0.16 });
    this.tone(high ? 880 : 440, high ? 0.6 : 0.2, { type: 'triangle', vol: 0.12, detune: 8 });
    if (high) {
      this.tone(1320, 0.6, { type: 'triangle', vol: 0.14 });
      this.noise(0.5, { vol: 0.12, freq: 3000, sweep: 0.4, q: 0.4 }); // whoosh off the line
    }
  }

  click() {
    this.tone(660, 0.06, { type: 'triangle', vol: 0.13 });
    this.tone(990, 0.05, { type: 'sine', vol: 0.06, delay: 0.02 });
  }

  lap() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.22, delay: i * 0.07 }));
  }

  finish(won: boolean) {
    const notes = won ? [523, 659, 784, 1047, 784, 1047, 1319] : [392, 330, 294, 262];
    notes.forEach((f, i) => {
      this.tone(f, 0.35, { type: won ? 'square' : 'triangle', vol: 0.16, delay: i * 0.13 });
      this.tone(f / 2, 0.35, { type: 'triangle', vol: 0.12, delay: i * 0.13 });
    });
    if (won) for (let i = 0; i < 12; i++) this.tone(1500 + Math.random() * 2500, 0.15, { type: 'sine', vol: 0.05, delay: 0.9 + i * 0.07, pan: Math.random() * 2 - 1 }); // sparkle
  }

  seasonChange(i: number) {
    const sc = SCALES[Math.min(i, 4)];
    const root = ROOTS[Math.min(i, 4)] + 12;
    [0, 2, 4, 5].forEach((k, n) => this.tone(mtof(root + sc[k]), 0.6, { type: i === 3 ? 'sine' : 'triangle', vol: 0.2, delay: n * 0.08 }));
    this.noise(0.8, { vol: 0.1, freq: 2000, sweep: 3, q: 0.5, attack: 0.3 }); // swoosh into the new season
    if (i === 3) this.noise(1.2, { vol: 0.08, freq: 3500, sweep: 0.5 }); // cold wind
  }

  petal(chain: number) {
    const f = 660 * Math.pow(2, Math.min(chain, 12) / 12 * 1.4);
    this.tone(f, 0.25, { type: 'sine', vol: 0.22 });
    this.tone(f * 1.5, 0.2, { type: 'triangle', vol: 0.1, delay: 0.04 });
    this.tone(f * 2, 0.3, { type: 'sine', vol: 0.05, delay: 0.08 }); // shimmer
  }

  chainBreak() {
    this.tone(300, 0.35, { type: 'sawtooth', vol: 0.16, slide: 0.35 });
    this.tone(240, 0.35, { type: 'sawtooth', vol: 0.1, slide: 0.35, delay: 0.06 });
  }

  leafKick() {
    this.noise(0.5, { vol: 0.35, freq: 1800, sweep: 0.35, type: 'bandpass', q: 0.6 });
    this.tone(520, 0.2, { type: 'triangle', vol: 0.16, slide: 1.6 });
  }

  blinded() {
    this.noise(0.9, { vol: 0.32, freq: 2500, sweep: 0.25, q: 0.5 });
    this.tone(220, 0.5, { type: 'sawtooth', vol: 0.1, slide: 0.5 });
  }

  leafWave() {
    this.noise(0.7, { vol: 0.2, freq: 2200, sweep: 0.4, q: 0.5, attack: 0.1 });
    this.noise(0.5, { vol: 0.08, freq: 5000, q: 1, delay: 0.1, pan: Math.random() - 0.5 }); // rustle
  }

  heatWarn() {
    this.tone(1200, 0.09, { type: 'square', vol: 0.12 });
    this.tone(1200, 0.09, { type: 'square', vol: 0.12, delay: 0.14 });
  }

  /** off a snow ramp: a rush of air */
  jump() {
    this.noise(0.6, { vol: 0.22, freq: 900, sweep: 2.4, q: 0.6, attack: 0.05 });
    this.tone(220, 0.35, { type: 'triangle', vol: 0.08, slide: 1.8 });
  }

  /** landing: a heavy thump and a burst of snow coming off the car */
  land() {
    this.tone(70, 0.3, { type: 'sine', vol: 0.55, slide: 0.5 });
    this.noise(0.35, { vol: 0.4, freq: 600, sweep: 0.5, type: 'lowpass' });
    this.noise(0.6, { vol: 0.18, freq: 3500, sweep: 0.6, q: 0.8, delay: 0.05 });
  }

  /** a blizzard gust sweeping through */
  blizzard() {
    this.noise(2.8, { vol: 0.16, freq: 700, sweep: 2.2, q: 1.4, attack: 0.9 });
    this.noise(2.4, { vol: 0.08, freq: 4200, sweep: 0.6, type: 'highpass', attack: 0.6, delay: 0.2 });
  }

  /** a firework: whistle up, then a crackling bang */
  firework() {
    this.tone(900, 0.35, { type: 'sine', vol: 0.05, slide: 2.2, pan: Math.random() - 0.5 });
    this.noise(0.5, { vol: 0.3, freq: 1200, sweep: 0.3, type: 'lowpass', delay: 0.32 });
    for (let i = 0; i < 6; i++) this.noise(0.04, { vol: 0.08, freq: 4000 + Math.random() * 3000, q: 2, delay: 0.4 + i * 0.06 + Math.random() * 0.04, attack: 0.002 });
  }

  /** the engine bursts into flames */
  stall() {
    this.noise(0.9, { vol: 0.5, freq: 900, sweep: 0.4, type: 'lowpass', q: 0.4 });
    this.tone(180, 0.7, { type: 'sawtooth', vol: 0.28, slide: 0.25 });
    this.noise(1.4, { vol: 0.25, freq: 6000, sweep: 0.7, type: 'highpass', delay: 0.1 });
    this.tone(60, 0.5, { type: 'sine', vol: 0.5, slide: 0.6 }); // whump
  }

  crackle() {
    this.noise(0.04 + Math.random() * 0.05, { vol: 0.14 + Math.random() * 0.14, freq: 1200 + Math.random() * 3500, type: 'bandpass', q: 1.5, attack: 0.002, pan: Math.random() * 0.6 - 0.3 });
  }

  /** engine recovered after burning: big steam hiss */
  cooldown() {
    this.noise(1.1, { vol: 0.3, freq: 7000, sweep: 0.5, type: 'highpass' });
    this.tone(700, 0.4, { type: 'sine', vol: 0.1, slide: 1.8 });
  }

  cool() {
    this.tone(1500, 0.3, { type: 'sine', vol: 0.06, slide: 0.7 });
  }

  melt() {
    this.tone(900 + Math.random() * 500, 0.1, { type: 'sine', vol: 0.11, slide: 0.5 });
    this.noise(0.25, { vol: 0.06, freq: 5500, type: 'highpass' });
  }

  snowHit() {
    this.noise(0.45, { vol: 0.5, freq: 600, sweep: 0.5, type: 'lowpass' });
    this.tone(90, 0.3, { type: 'sine', vol: 0.5, slide: 0.5 });
  }

  iceBreak() {
    this.noise(0.5, { vol: 0.5, freq: 4000, sweep: 0.3, type: 'bandpass', q: 1.2 });
    this.tone(1400, 0.3, { type: 'triangle', vol: 0.18, slide: 0.3 });
    this.tone(120, 0.8, { type: 'sine', vol: 0.5, slide: 0.4, delay: 0.1 });
    this.noise(0.9, { vol: 0.25, freq: 500, sweep: 0.5, type: 'lowpass', delay: 0.15 }); // splash into the water
  }

  crack() {
    this.noise(0.12, { vol: 0.3, freq: 3500, type: 'bandpass', q: 3, attack: 0.002 });
    this.tone(2200, 0.1, { type: 'square', vol: 0.07, slide: 0.5 });
  }

  ice() {
    this.noise(0.35, { vol: 0.12, freq: 5200, sweep: 0.6, type: 'bandpass', q: 1.5 });
  }

  mud() {
    this.noise(0.35, { vol: 0.4, freq: 450, sweep: 0.6, type: 'lowpass', q: 0.6 });
    this.tone(110, 0.2, { type: 'sine', vol: 0.2, slide: 0.6 }); // squelch
  }

  splash() {
    this.noise(0.5, { vol: 0.28, freq: 3000, sweep: 0.5, q: 0.7 });
  }

  branch() {
    this.noise(0.3, { vol: 0.5, freq: 700, sweep: 0.4, type: 'lowpass' });
    this.tone(110, 0.25, { type: 'triangle', vol: 0.4, slide: 0.5 });
    this.noise(0.12, { vol: 0.25, freq: 2500, q: 2, attack: 0.002 }); // snap
  }

  /** a branch thumps down nearby; vol 0..1 by distance */
  thump(vol: number) {
    if (vol <= 0.02) return;
    this.noise(0.3, { vol: 0.35 * vol, freq: 500, sweep: 0.4, type: 'lowpass' });
    this.tone(80, 0.25, { type: 'sine', vol: 0.4 * vol, slide: 0.5 });
  }

  wall(power: number) {
    const p = Math.min(1, power);
    this.noise(0.2, { vol: 0.15 + p * 0.3, freq: 900, sweep: 0.5, type: 'lowpass' });
    this.tone(95, 0.18, { type: 'square', vol: 0.1 + p * 0.15, slide: 0.5 });
    this.noise(0.25, { vol: 0.06 + p * 0.1, freq: 3500, q: 3, sweep: 0.7 }); // metal scrape
  }

  /** another car zips past close by; pan -1..1 */
  pass(pan: number) {
    this.noise(0.45, { vol: 0.12, freq: 1600, sweep: 0.45, q: 0.6, attack: 0.08, pan });
    this.tone(160, 0.4, { type: 'sawtooth', vol: 0.04, slide: 0.7, pan });
  }

  /** car-to-car bump */
  bump(power: number) {
    const p = Math.min(1, power);
    this.noise(0.15, { vol: 0.15 + p * 0.25, freq: 700, sweep: 0.5, type: 'lowpass' });
    this.tone(140, 0.12, { type: 'square', vol: 0.08 + p * 0.1, slide: 0.6 });
  }

  place(up: boolean) {
    this.tone(up ? 700 : 400, 0.12, { type: 'triangle', vol: 0.13, slide: up ? 1.5 : 0.7 });
    if (up) this.tone(1050, 0.12, { type: 'triangle', vol: 0.08, delay: 0.06, slide: 1.3 });
  }
}
