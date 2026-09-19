import { BUILDINGS, type BuildingId } from '../data/buildings';
import type { World } from '../sim/world';

/**
 * Everything you can hear, generated on the fly.
 *
 * There are no audio files and there will not be: a `.ogg` per trade would
 * dwarf the rest of the APK and break the rule that the whole art direction
 * ships as code. Wind is filtered noise, a bird is two sine sweeps, an axe is
 * a noise burst through a band-pass. It costs a handful of nodes and weighs
 * nothing.
 *
 * Browsers refuse to start an AudioContext before the player has touched the
 * screen, so everything here is dormant until `unlock()` is called from a real
 * gesture, and silent for ever after if the player mutes it.
 */

const MUTE_KEY = 'therise.muted.v1';
const VOLUME_KEY = 'therise.volume.v1';

/** Never more than this many one-shots in flight; a busy city can ask for a lot. */
const MAX_VOICES = 12;

/**
 * Length of the looping ambience buffers, in seconds.
 *
 * This used to be one second, and one second of noise on a loop is not a bed,
 * it is a rhythm: the ear locks onto the repeat after a few passes and hears a
 * motor turning over. Eight seconds, played back by two sources at slightly
 * different rates, takes long enough to come round that nothing is audible as
 * a pattern.
 */
const BED_SECONDS = 8;

/** Seconds between two distant rolls of thunder during a storm. */
const THUNDER_MIN = 26;
const THUNDER_SPREAD = 45;

/**
 * How long, on average, between two birds.
 *
 * A bird every four seconds is not a countryside, it is an aviary — and after
 * ten minutes of play it is the only thing you can hear. One every twenty-odd
 * seconds reads as "there are birds about" and then gets out of the way.
 */
const BIRD_MIN = 13;
const BIRD_SPREAD = 26;

export type SoundName =
  | 'chop'
  | 'saw'
  | 'hammer'
  | 'anvil'
  | 'pick'
  | 'scythe'
  | 'water'
  | 'market'
  | 'coin'
  | 'built'
  | 'bell'
  | 'alarm'
  | 'good'
  | 'bad'
  | 'tap';

/** Which sound a trade makes while it is working. */
const WORK_SOUND: Partial<Record<BuildingId, SoundName>> = {
  woodcutter_camp: 'chop',
  lumber_camp: 'chop',
  forester_hut: 'chop',
  sawmill: 'saw',
  water_sawmill: 'saw',
  carpenter: 'saw',
  cobbler: 'hammer',
  fletcher: 'hammer',
  blacksmith: 'anvil',
  smelter: 'anvil',
  goldsmith: 'hammer',
  quarry: 'pick',
  great_quarry: 'pick',
  clay_pit: 'pick',
  coal_mine: 'pick',
  iron_mine: 'pick',
  gold_mine: 'pick',
  deep_mine: 'pick',
  wheat_field: 'scythe',
  flax_field: 'scythe',
  fisher_hut: 'water',
  fishing_pier: 'water',
  fishing_dock: 'water',
  fishing_harbour: 'water',
  well: 'water',
  fountain: 'water',
  market: 'market',
  grand_market: 'market',
  trade_post: 'market',
  tavern: 'market',
  theatre: 'market',
  village_green: 'market',
  chapel: 'bell',
  bakery: 'hammer',
  brewery: 'water',
  tannery: 'water',
  weaver: 'saw',
  tailor: 'saw',
  butcher: 'anvil',
  windmill: 'saw',
  brick_kiln: 'hammer',
  charcoal_burner: 'hammer',
  chandlery: 'hammer',
};

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private rainGain: GainNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private bed: AudioBuffer | null = null;
  private drops: AudioBuffer | null = null;
  private voices = 0;

  muted = readFlag(MUTE_KEY, false);
  volume = readNumber(VOLUME_KEY, 0.7);

  private workTimer = 0;
  private birdTimer = 6;
  private gust = 0;
  private gustTarget = 0;
  private thunderTimer = THUNDER_MIN;
  private lastDay = 0;

  /** Call from a real pointer or key event; safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch {
      // No audio on this device. Everything below no-ops.
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    this.buildAmbience();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    writeFlag(MUTE_KEY, muted);
    this.applyVolume();
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    writeNumber(VOLUME_KEY, this.volume);
    this.applyVolume();
  }

  private applyVolume(): void {
    if (!this.master || !this.ctx) return;
    const target = this.muted ? 0 : this.volume;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
  }

  // ── Ambience ─────────────────────────────────────────────────────────────

  /** One second of pink-ish noise, reused by every one-shot. */
  private noiseBuffer(): AudioBuffer {
    if (this.noise) return this.noise;
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      // A one-pole low pass turns white noise into something that sounds like
      // moving air rather than a broken radio.
      last = last * 0.86 + white * 0.14;
      data[i] = last * 3.2;
    }
    this.noise = buffer;
    return buffer;
  }

  /**
   * A long loop of broadband noise for the ambient beds.
   *
   * Deliberately *not* the one-shot buffer: that one is filtered so far down
   * that there is nothing left above a kilohertz, and rain built on it was a
   * hum with a whistle on top rather than water. This one keeps its top end,
   * and the filters downstream decide what each bed sounds like.
   */
  private bedBuffer(): AudioBuffer {
    if (this.bed) return this.bed;
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * BED_SECONDS);
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      // Barely coloured: a touch of smoothing to take the digital edge off,
      // nothing like the one-pole above.
      last = last * 0.25 + white * 0.75;
      data[i] = last;
    }
    // Cross-fade the tail into the head so the seam is not a click.
    const fade = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      data[i] = data[i] * k + data[n - fade + i] * (1 - k);
    }
    this.bed = buffer;
    return buffer;
  }

  /**
   * Rain is not just hiss: what makes it read as *rain* is the hail of
   * individual drops landing. This buffer is a few thousand short decaying
   * impulses scattered at random — played on a loop under the hiss, it is the
   * difference between weather and a radio between stations.
   */
  private dropBuffer(): AudioBuffer {
    if (this.drops) return this.drops;
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * BED_SECONDS);
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const count = Math.floor(BED_SECONDS * 900);
    for (let d = 0; d < count; d++) {
      const at = Math.floor(Math.random() * (n - 400));
      const decay = 0.0016 + Math.random() * 0.004;
      const len = Math.floor(ctx.sampleRate * decay);
      const amp = 0.25 + Math.random() * 0.75;
      for (let i = 0; i < len; i++) {
        data[at + i] += (Math.random() * 2 - 1) * amp * (1 - i / len);
      }
    }
    const fade = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      data[i] = data[i] * k + data[n - fade + i] * (1 - k);
    }
    this.drops = buffer;
    return buffer;
  }

  /** Starts a looping source on the ambience bed, at its own rate. */
  private loop(buffer: AudioBuffer, rate: number, destination: AudioNode): void {
    const source = this.ctx!.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = rate;
    source.connect(destination);
    source.start(this.ctx!.currentTime + Math.random() * 0.2);
  }

  private buildAmbience(): void {
    const ctx = this.ctx!;
    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.value = 1;
    this.ambientGain.connect(this.master!);

    // ── Wind ───────────────────────────────────────────────────────────────
    // A low-pass, not a resonant band-pass: a band-pass with any Q at all on
    // a noise bed is a pitch, and a pitch that never stops is a drone. Two
    // sources at different rates keep it from ever settling into a pattern.
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.4;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.03;
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.ambientGain);
    this.loop(this.bedBuffer(), 1, this.windFilter);
    this.loop(this.bedBuffer(), 0.77, this.windFilter);

    // ── Rain ───────────────────────────────────────────────────────────────
    // Two layers: the broad hiss of water on ground, and the drops on top.
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    this.rainGain.connect(this.ambientGain);

    this.rainFilter = ctx.createBiquadFilter();
    this.rainFilter.type = 'lowpass';
    this.rainFilter.frequency.value = 5200;
    this.rainFilter.Q.value = 0.4;
    const rainBody = ctx.createBiquadFilter();
    rainBody.type = 'highpass';
    rainBody.frequency.value = 420;
    rainBody.Q.value = 0.5;
    const hiss = ctx.createGain();
    hiss.gain.value = 0.55;
    this.rainFilter.connect(rainBody);
    rainBody.connect(hiss);
    hiss.connect(this.rainGain);
    this.loop(this.bedBuffer(), 1.13, this.rainFilter);
    this.loop(this.bedBuffer(), 0.89, this.rainFilter);

    const dropTone = ctx.createBiquadFilter();
    dropTone.type = 'bandpass';
    dropTone.frequency.value = 3100;
    dropTone.Q.value = 0.8;
    const dropGain = ctx.createGain();
    dropGain.gain.value = 0.9;
    dropTone.connect(dropGain);
    dropGain.connect(this.rainGain);
    this.loop(this.dropBuffer(), 1, dropTone);
    this.loop(this.dropBuffer(), 0.81, dropTone);
  }

  /**
   * Follows the world each frame: weather, time of day, and an occasional
   * work sound from whatever is being made near the camera.
   */
  update(world: World, dt: number, cameraX: number, cameraY: number, span: number): void {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const daylight = world.daylight();

    // Wind picks up in a storm and at night, and drops on a still summer day.
    const stormy = world.weather === 'storm' ? 1 : world.weather === 'rain' ? 0.5 : 0;
    // Gusting. A bed held at a constant level is a drone whatever it is made
    // of; what stops the ear treating it as machinery is that it breathes.
    this.gust += (this.gustTarget - this.gust) * Math.min(1, dt * 0.4);
    if (Math.random() < dt * 0.14) this.gustTarget = Math.random();
    const windTarget = (0.022 + stormy * 0.06 + (1 - daylight) * 0.012) * (0.55 + this.gust * 0.75);
    this.windGain!.gain.setTargetAtTime(windTarget, now, 1.1);
    this.windFilter!.frequency.setTargetAtTime(380 + stormy * 300 + this.gust * 260, now, 1.6);

    const rainTarget = world.weather === 'storm' ? 0.085 : world.weather === 'rain' ? 0.05 : 0;
    this.rainGain!.gain.setTargetAtTime(rainTarget, now, 1.5);
    // Heavier rain is brighter: more drops, less muffled by distance.
    this.rainFilter!.frequency.setTargetAtTime(4200 + stormy * 2600, now, 2);

    // Distant thunder, rarely, and only in a real storm.
    if (world.weather === 'storm') {
      this.thunderTimer -= dt;
      if (this.thunderTimer <= 0) {
        this.thunderTimer = THUNDER_MIN + Math.random() * THUNDER_SPREAD;
        this.thunder();
      }
    } else {
      this.thunderTimer = THUNDER_MIN + Math.random() * THUNDER_SPREAD;
    }

    // Birds, in daylight, outside winter. Rare on purpose — see BIRD_MIN.
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = BIRD_MIN + Math.random() * BIRD_SPREAD;
      const season = world.time.season;
      if (daylight > 0.45 && season !== 'winter' && world.weather === 'clear') {
        this.bird(0.45 + Math.random() * 0.45);
      }
    }

    // A bell on the hour of dawn: the clearest "a day has passed" signal there
    // is, and it costs nothing.
    if (world.time.day !== this.lastDay) {
      this.lastDay = world.time.day;
      if (this.lastDay > 1) this.play('bell', 0.5);
    }

    // One work sound at a time, from a building the player can actually see.
    this.workTimer -= dt;
    if (this.workTimer > 0) return;
    this.workTimer = 0.45 + Math.random() * 0.7;
    const b = this.pickAudibleBuilding(world, cameraX, cameraY, span);
    if (!b) return;
    const sound = WORK_SOUND[b.def];
    if (!sound) return;
    const dist = Math.hypot(b.cx - cameraX, b.cy - cameraY);
    const falloff = Math.max(0, 1 - dist / Math.max(6, span));
    this.play(sound, 0.35 * falloff * falloff);
  }

  /**
   * Samples a handful of buildings rather than scanning the list: a city has
   * hundreds, and a sound every half second does not need the best candidate.
   */
  private pickAudibleBuilding(
    world: World,
    cx: number,
    cy: number,
    span: number,
  ): { def: BuildingId; cx: number; cy: number } | null {
    const list = world.buildingList;
    if (list.length === 0) return null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const b = list[Math.floor(Math.random() * list.length)];
      if (b.state !== 'active' || !b.enabled || b.stall) continue;
      const def = BUILDINGS[b.def];
      if (def.workers > 0 && b.workers.length === 0) continue;
      if (Math.abs(b.cx - cx) > span || Math.abs(b.cy - cy) > span) continue;
      return b;
    }
    return null;
  }

  // ── One-shots ────────────────────────────────────────────────────────────

  play(name: SoundName, gain = 0.4): void {
    if (!this.ctx || this.muted || this.voices >= MAX_VOICES) return;
    // A suspended context has a frozen clock: anything scheduled while the
    // game is in the background would all fire at once on the way back.
    if (this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    switch (name) {
      case 'chop':
        this.thud(now, 190, 0.16, gain, 900);
        break;
      case 'saw':
        // Two rasps, back and forth, like a saw in a log.
        this.rasp(now, gain);
        this.rasp(now + 0.19, gain * 0.8);
        break;
      case 'hammer':
        this.thud(now, 320, 0.1, gain, 1800);
        break;
      case 'anvil':
        this.ring(now, 1180, 0.42, gain * 0.7);
        this.thud(now, 260, 0.07, gain * 0.7, 2400);
        break;
      case 'pick':
        this.thud(now, 150, 0.13, gain, 1300);
        break;
      case 'scythe':
        this.rasp(now, gain * 0.6, 0.22);
        break;
      case 'water':
        this.rasp(now, gain * 0.45, 0.3, 700);
        break;
      case 'market':
        // A murmur of voices: two detuned formants under noise.
        this.murmur(now, gain * 0.6);
        break;
      case 'coin':
        this.ring(now, 2100, 0.2, gain * 0.5);
        this.ring(now + 0.05, 2700, 0.16, gain * 0.35);
        break;
      case 'built':
        this.ring(now, 660, 0.28, gain * 0.6);
        this.ring(now + 0.12, 880, 0.34, gain * 0.6);
        break;
      case 'bell':
        this.ring(now, 520, 1.6, gain * 0.55);
        this.ring(now + 0.015, 784, 1.3, gain * 0.28);
        break;
      case 'alarm':
        for (let i = 0; i < 3; i++) this.ring(now + i * 0.22, 880, 0.2, gain * 0.6);
        break;
      case 'good':
        this.ring(now, 700, 0.16, gain * 0.45);
        this.ring(now + 0.1, 1050, 0.2, gain * 0.45);
        break;
      case 'bad':
        this.ring(now, 320, 0.22, gain * 0.45);
        this.ring(now + 0.11, 240, 0.28, gain * 0.45);
        break;
      case 'tap':
        this.thud(now, 540, 0.05, gain * 0.5, 2600);
        break;
    }
  }

  /** A struck, damped body: noise through a low-pass plus a pitched thump. */
  private thud(at: number, freq: number, length: number, gain: number, cutoff: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.4), at + length);

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer();
    noise.playbackRate.value = 1.4;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;

    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, at);
    env.gain.exponentialRampToValueAtTime(0.0008, at + length);

    osc.connect(env);
    noise.connect(filter);
    filter.connect(env);
    env.connect(this.master!);
    this.startStop(osc, at, length);
    this.startStop(noise, at, length);
  }

  /** A sustained scrape: band-passed noise with a slow swell. */
  private rasp(at: number, gain: number, length = 0.17, centre = 1500): void {
    const ctx = this.ctx!;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer();
    noise.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(centre, at);
    filter.frequency.linearRampToValueAtTime(centre * 0.65, at + length);
    filter.Q.value = 2.2;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0008, at);
    env.gain.linearRampToValueAtTime(gain * 0.5, at + length * 0.35);
    env.gain.exponentialRampToValueAtTime(0.0008, at + length);
    noise.connect(filter);
    filter.connect(env);
    env.connect(this.master!);
    this.startStop(noise, at, length);
  }

  /** A struck metal or glass tone. */
  private ring(at: number, freq: number, length: number, gain: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0008, at);
    env.gain.linearRampToValueAtTime(gain, at + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0008, at + length);
    osc.connect(env);
    env.connect(this.master!);
    this.startStop(osc, at, length);
  }

  /** A crowd: noise through two vowel-ish peaks. */
  private murmur(at: number, gain: number): void {
    const ctx = this.ctx!;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer();
    noise.playbackRate.value = 0.5;
    const a = ctx.createBiquadFilter();
    a.type = 'bandpass';
    a.frequency.value = 520 + Math.random() * 160;
    a.Q.value = 4;
    const b = ctx.createBiquadFilter();
    b.type = 'bandpass';
    b.frequency.value = 1180 + Math.random() * 260;
    b.Q.value = 5;
    const env = ctx.createGain();
    const length = 0.5;
    env.gain.setValueAtTime(0.0008, at);
    env.gain.linearRampToValueAtTime(gain * 0.4, at + 0.2);
    env.gain.exponentialRampToValueAtTime(0.0008, at + length);
    noise.connect(a);
    a.connect(b);
    b.connect(env);
    env.connect(this.master!);
    this.startStop(noise, at, length);
  }

  /**
   * A bird.
   *
   * Three shapes rather than one: a fast trill, a two-note whistle, and a low
   * slow coo. Hearing the same four-note sweep every time is what made the old
   * ones grating long before their frequency did.
   */
  private bird(gain: number): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime + 0.02;
    const kind = Math.random();
    if (kind < 0.34) {
      // Trill: many short notes, barely moving in pitch.
      const base = 2600 + Math.random() * 1400;
      const notes = 4 + Math.floor(Math.random() * 4);
      for (let i = 0; i < notes; i++) {
        this.chirp(at + i * 0.055, base * (0.97 + Math.random() * 0.06), 1.04, 0.045, 0.026 * gain);
      }
    } else if (kind < 0.75) {
      // Two-note whistle, the second answering the first.
      const base = 1900 + Math.random() * 1100;
      this.chirp(at, base, 1.35 + Math.random() * 0.3, 0.09, 0.03 * gain);
      this.chirp(at + 0.17, base * 0.82, 1.2, 0.11, 0.024 * gain);
    } else {
      // A wood pigeon somewhere behind the trees.
      const base = 520 + Math.random() * 120;
      this.chirp(at, base, 1.12, 0.17, 0.03 * gain);
      this.chirp(at + 0.26, base * 0.94, 0.92, 0.22, 0.022 * gain);
    }
  }

  /** One sung note: a sine sweeping from `freq` by `bend` over `length`. */
  private chirp(at: number, freq: number, bend: number, length: number, gain: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, at);
    osc.frequency.exponentialRampToValueAtTime(freq * bend, at + length);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0008, at);
    env.gain.linearRampToValueAtTime(gain, at + Math.min(0.02, length * 0.25));
    env.gain.exponentialRampToValueAtTime(0.0008, at + length);
    osc.connect(env);
    env.connect(this.master!);
    this.startStop(osc, at, length);
  }

  /**
   * Thunder: a long roll of very low noise, far away. No crack — a strike
   * overhead would be a jump-scare in a game about carrying planks about.
   */
  private thunder(): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime + 0.05;
    const length = 2.4 + Math.random() * 1.8;
    const noise = ctx.createBufferSource();
    noise.buffer = this.bedBuffer();
    noise.playbackRate.value = 0.25;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(260, at);
    filter.frequency.exponentialRampToValueAtTime(70, at + length);
    filter.Q.value = 0.6;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0008, at);
    env.gain.linearRampToValueAtTime(0.16, at + 0.5 + Math.random() * 0.4);
    env.gain.exponentialRampToValueAtTime(0.0008, at + length);
    noise.connect(filter);
    filter.connect(env);
    env.connect(this.master!);
    this.startStop(noise, at, length);
  }

  private startStop(node: AudioScheduledSourceNode, at: number, length: number): void {
    this.voices++;
    node.onended = (): void => {
      this.voices = Math.max(0, this.voices - 1);
    };
    node.start(at);
    node.stop(at + length + 0.02);
  }

  /**
   * Silences everything until `resume()`.
   *
   * This is not a nicety. A WebView that goes to the background keeps its
   * AudioContext running: leaving the game with rain playing left the rain
   * playing through a locked screen, and the only way to stop it was to kill
   * the app from the task switcher.
   */
  suspend(): void {
    if (!this.ctx || this.ctx.state === 'closed' || this.ctx.state === 'suspended') return;
    void this.ctx.suspend().catch(() => undefined);
  }

  /** Brings the ambience back when the player returns to the game. */
  resume(): void {
    if (!this.ctx || this.ctx.state !== 'suspended') return;
    void this.ctx.resume().catch(() => undefined);
  }

  dispose(): void {
    if (!this.ctx) return;
    void this.ctx.close();
    this.ctx = null;
    this.master = null;
  }
}

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === '1';
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* The setting still applies for this session. */
  }
}

function readNumber(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
  } catch {
    return fallback;
  }
}

function writeNumber(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* Ditto. */
  }
}
