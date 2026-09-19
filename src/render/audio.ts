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
  private noise: AudioBuffer | null = null;
  private voices = 0;

  muted = readFlag(MUTE_KEY, false);
  volume = readNumber(VOLUME_KEY, 0.7);

  private workTimer = 0;
  private birdTimer = 2;
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

  /** One second of pink-ish noise, reused by wind, rain and every one-shot. */
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

  private buildAmbience(): void {
    const ctx = this.ctx!;
    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.value = 1;
    this.ambientGain.connect(this.master!);

    // Wind: looping noise through a gentle band-pass.
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 420;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.05;
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer();
    wind.loop = true;
    wind.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.ambientGain);
    wind.start();

    // Rain: the same noise, brighter and only audible when it is raining.
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 1400;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    const rain = ctx.createBufferSource();
    rain.buffer = this.noiseBuffer();
    rain.loop = true;
    rain.connect(rainFilter);
    rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.ambientGain);
    rain.start();
  }

  /**
   * Follows the world each frame: weather, time of day, and an occasional
   * work sound from whatever is being made near the camera.
   */
  update(world: World, dt: number, cameraX: number, cameraY: number, span: number): void {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const daylight = world.daylight();

    // Wind picks up in a storm and at night, and drops on a still summer day.
    const stormy = world.weather === 'storm' ? 1 : world.weather === 'rain' ? 0.5 : 0;
    const windTarget = 0.03 + stormy * 0.09 + (1 - daylight) * 0.02;
    this.windGain!.gain.setTargetAtTime(windTarget, now, 0.8);
    this.windFilter!.frequency.setTargetAtTime(380 + stormy * 520, now, 1.2);

    const rainTarget = world.weather === 'storm' ? 0.075 : world.weather === 'rain' ? 0.045 : 0;
    this.rainGain!.gain.setTargetAtTime(rainTarget, now, 1.5);

    // Birds, in daylight, outside winter.
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 2.5 + Math.random() * 6;
      const season = world.time.season;
      if (daylight > 0.45 && season !== 'winter' && world.weather === 'clear') {
        this.bird(0.5 + Math.random() * 0.5);
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

  /** Two quick sine sweeps: a bird, as far as anyone is concerned. */
  private bird(gain: number): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime + 0.02;
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) {
      const t = at + i * (0.09 + Math.random() * 0.05);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const base = 2200 + Math.random() * 1500;
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.5), t + 0.05);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0008, t);
      env.gain.linearRampToValueAtTime(0.035 * gain, t + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0008, t + 0.07);
      osc.connect(env);
      env.connect(this.master!);
      this.startStop(osc, t, 0.08);
    }
  }

  private startStop(node: AudioScheduledSourceNode, at: number, length: number): void {
    this.voices++;
    node.onended = (): void => {
      this.voices = Math.max(0, this.voices - 1);
    };
    node.start(at);
    node.stop(at + length + 0.02);
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
