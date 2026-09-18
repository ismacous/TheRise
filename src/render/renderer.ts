import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PCFSoftShadowMap,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { clamp, clamp01, lerp } from '../core/util';
import { DAYS_PER_SEASON, type World } from '../sim/world';
import { SEASONS } from '../sim/types';
import { BuildingRenderer } from './buildingRenderer';
import { CameraController } from './camera';
import { HEIGHT_SCALE } from './constants';
import { GroundMarkers, ParticleSystem, PlacementGhost, WeatherParticles } from './effects';
import { FaunaRenderer } from './fauna';
import { blendPalettes, seasonPalette, type SeasonPalette } from './palette';
import { PropRenderer } from './props';
import { TerrainRenderer } from './terrain';
import { VillagerRenderer } from './villagerRenderer';
import { WaterRenderer } from './water';

export interface RenderQuality {
  shadows: boolean;
  shadowMapSize: number;
  pixelRatio: number;
  weather: boolean;
  particles: boolean;
}

export const QUALITY_PRESETS: Record<'low' | 'medium' | 'high', RenderQuality> = {
  low: { shadows: false, shadowMapSize: 1024, pixelRatio: 1, weather: false, particles: true },
  medium: { shadows: true, shadowMapSize: 1024, pixelRatio: 1.25, weather: true, particles: true },
  high: { shadows: true, shadowMapSize: 2048, pixelRatio: 2, weather: true, particles: true },
};

const NIGHT_SKY = new Color('#12203a').convertSRGBToLinear();
const DUSK_SKY = new Color('#e4926a').convertSRGBToLinear();
const NIGHT_AMBIENT = new Color('#2f4468').convertSRGBToLinear();

/** Owns the Three.js scene and every sub-renderer. */
export class GameRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly controls: CameraController;

  readonly terrain: TerrainRenderer;
  readonly props: PropRenderer;
  readonly water: WaterRenderer;
  readonly buildings = new BuildingRenderer();
  readonly villagers = new VillagerRenderer();
  readonly fauna = new FaunaRenderer();
  readonly particles = new ParticleSystem();
  readonly weather = new WeatherParticles();
  readonly markers = new GroundMarkers();
  readonly ghost = new PlacementGhost();

  private sun: DirectionalLight;
  private hemi: HemisphereLight;
  private ambient: AmbientLight;
  private world: World;
  private palette: SeasonPalette;
  private quality: RenderQuality;
  private fog: Fog;
  private elapsed = 0;

  /** Frame timing for the debug overlay. */
  frameMs = 0;

  constructor(canvas: HTMLCanvasElement, world: World, quality: RenderQuality) {
    this.world = world;
    this.quality = quality;
    this.palette = seasonPalette(world.time.season);

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: quality.pixelRatio <= 1.5,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatio));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    this.scene.background = this.palette.sky.clone();
    this.fog = new Fog(this.palette.fog.clone(), 60, 190);
    this.scene.fog = this.fog;

    this.controls = new CameraController(canvas, world.map, window.innerWidth / window.innerHeight);

    this.terrain = new TerrainRenderer(world.map, this.palette);
    this.props = new PropRenderer(world, this.palette);
    this.water = new WaterRenderer(world.map, this.palette);

    this.hemi = new HemisphereLight(0xbcd8f0, 0x5a6a4a, 0.55);
    this.ambient = new AmbientLight(0xffffff, 0.35);
    this.sun = new DirectionalLight(0xfff3dc, 1.5);
    this.sun.castShadow = quality.shadows;
    this.sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 160;
    this.sun.shadow.bias = -0.0009;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun, this.sun.target, this.hemi, this.ambient);

    this.scene.add(
      this.terrain.group,
      this.props.group,
      this.water.mesh,
      this.buildings.group,
      this.villagers.group,
      this.fauna.group,
      this.particles.mesh,
      this.markers.group,
      this.ghost.group,
    );
    if (quality.weather) this.scene.add(this.weather.points);

    this.controls.snapTo(world.startX, world.startY, 30);
    this.resize();
  }

  setQuality(q: RenderQuality): void {
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadows;
    this.sun.castShadow = q.shadows;
    this.sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null as never;
    if (q.weather && !this.weather.points.parent) this.scene.add(this.weather.points);
    if (!q.weather && this.weather.points.parent) this.scene.remove(this.weather.points);
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.controls.setAspect(w / h);
  }

  /** Blends between the current and next season palette over the last day. */
  private updatePalette(): void {
    const w = this.world;
    const dayInSeason = ((w.time.day - 1) % DAYS_PER_SEASON) + w.time.dayFraction;
    const t = clamp01((dayInSeason - (DAYS_PER_SEASON - 1)) / 1);
    const current = seasonPalette(w.time.season);
    if (t <= 0.001) {
      this.palette = current;
    } else {
      const nextSeason = SEASONS[(SEASONS.indexOf(w.time.season) + 1) % 4];
      this.palette = blendPalettes(current, seasonPalette(nextSeason), t);
    }
  }

  private lastSeason = '';

  update(dt: number): void {
    const t0 = performance.now();
    this.elapsed += dt;
    const w = this.world;

    this.updatePalette();
    if (this.lastSeason !== w.time.season) {
      this.lastSeason = w.time.season;
      this.terrain.setPalette(this.palette);
      this.props.setPalette(this.palette);
      this.water.setPalette(this.palette);
    }

    // Drain simulation change queues into the chunked renderers.
    for (const c of w.terrainChanges) this.terrain.markDirty(c.x, c.y, c.w, c.h);
    w.terrainChanges.length = 0;
    for (const c of w.nodeChanges) this.props.markDirtyAt(c.x, c.y);
    w.nodeChanges.length = 0;
    this.terrain.flush(2);
    this.props.flush(2);

    this.controls.update(dt);
    this.updateLighting();

    this.buildings.sync(w);
    this.buildings.update(w, dt, this.nightFactor());
    this.villagers.update(w, this.elapsed);
    this.fauna.update(w, this.elapsed);
    this.water.update(this.elapsed);
    this.water.setSunColor(this.sun.color);

    if (this.quality.particles) {
      this.particles.spawnFromWorld(w, dt);
      this.particles.update(dt, this.controls.camera.quaternion);
    }
    if (this.quality.weather) {
      this.weather.setWeather(w.weather);
      this.weather.update(this.elapsed, dt, this.controls.target);
    }
    this.markers.pulse(this.elapsed);

    this.frameMs = performance.now() - t0;
  }

  nightFactor(): number {
    return clamp01(1 - this.world.daylight() * 1.4);
  }

  private updateLighting(): void {
    const w = this.world;
    const f = w.time.dayFraction;
    const daylight = w.daylight();
    const p = this.palette;

    // Sun arcs from east to west; at night the "sun" becomes a pale moon.
    const angle = (f - 0.25) * Math.PI * 2;
    const elevation = Math.sin((f - 0.2) * Math.PI / 0.6);
    const dist = 70;
    const target = this.controls.target;
    this.sun.position.set(
      target.x + Math.cos(angle) * dist * 0.7,
      target.y + Math.max(12, elevation * dist),
      target.z + Math.sin(angle) * dist * 0.7 + 25,
    );
    this.sun.target.position.copy(target);
    this.sun.target.updateMatrixWorld();

    // Tighten the shadow frustum around what the player can actually see.
    const shadowSpan = clamp(this.controls.distance * 0.85, 18, 70);
    const cam = this.sun.shadow.camera;
    cam.left = -shadowSpan;
    cam.right = shadowSpan;
    cam.top = shadowSpan;
    cam.bottom = -shadowSpan;
    cam.far = 240;
    cam.updateProjectionMatrix();

    // Dusk tint near sunrise and sunset.
    const dusk = clamp01(1 - Math.abs(daylight - 0.35) * 3.2) * clamp01(daylight * 3);
    const sunColor = p.sunColor.clone().lerp(DUSK_SKY, dusk * 0.7);
    this.sun.color.copy(sunColor);
    this.sun.intensity = lerp(0.12, 1.65, daylight);

    const rainDim = 1 - this.world.wetness * 0.35;
    this.hemi.intensity = lerp(0.18, 0.62, daylight) * rainDim;
    this.ambient.intensity = lerp(0.22, 0.4, daylight) * rainDim;
    this.ambient.color.copy(p.ambient).lerp(NIGHT_AMBIENT, 1 - daylight);

    const sky = (this.scene.background as Color) ?? new Color();
    sky.copy(p.sky).lerp(DUSK_SKY, dusk * 0.55).lerp(NIGHT_SKY, 1 - daylight);
    const stormDim = this.world.weather === 'storm' ? 0.65 : this.world.weather === 'rain' ? 0.82 : 1;
    sky.multiplyScalar(stormDim);
    this.scene.background = sky;

    this.fog.color.copy(sky);
    const fogStrength = this.world.weather === 'fog' ? 0.45 : this.world.wetness * 0.25;
    this.fog.near = lerp(this.controls.distance * 1.6, this.controls.distance * 0.7, fogStrength);
    this.fog.far = lerp(this.controls.distance * 5.5, this.controls.distance * 2.4, fogStrength);
  }

  render(): void {
    this.renderer.render(this.scene, this.controls.camera);
  }

  /** World point under a screen coordinate, or null when the ray misses. */
  pickGround(clientX: number, clientY: number): Vector3 | null {
    return this.controls.screenToGround(clientX, clientY);
  }

  groundHeight(x: number, z: number): number {
    return this.world.map.sampleElevation(x, z) * HEIGHT_SCALE;
  }

  dispose(): void {
    this.controls.dispose();
    this.terrain.dispose();
    this.props.dispose();
    this.water.dispose();
    this.buildings.dispose();
    this.villagers.dispose();
    this.fauna.dispose();
    this.particles.dispose();
    this.weather.dispose();
    this.markers.dispose();
    this.ghost.dispose();
    this.renderer.dispose();
  }
}
