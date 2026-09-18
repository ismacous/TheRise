import {
  Color,
  DoubleSide,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Uniform,
} from 'three';
import type { TileMap } from '../sim/tilemap';
import { WATER_Y } from './constants';
import type { SeasonPalette } from './palette';

const VERT = /* glsl */ `
  uniform highp float uTime;
  varying vec3 vWorld;
  varying float vWave;

  void main() {
    vec3 p = position;
    // Two crossing swells plus a fine ripple: cheap, and it reads as water.
    float w =
      sin(p.x * 0.09 + uTime * 0.55) * 0.055 +
      sin(p.y * 0.13 - uTime * 0.42) * 0.045 +
      sin((p.x + p.y) * 0.31 + uTime * 1.15) * 0.018;
    p.z += w;
    vWave = w;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAG = /* glsl */ `
  uniform highp float uTime;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uSun;
  uniform float uOpacity;
  varying vec3 vWorld;
  varying float vWave;

  void main() {
    // Fake depth from the wave field plus a slow large-scale variation, so the
    // lake reads as deeper in the middle without sampling a depth texture.
    float band = sin(vWorld.x * 0.035 + 1.7) * sin(vWorld.z * 0.031 - 0.6);
    float depth = clamp(0.5 + band * 0.5 + vWave * 1.2, 0.0, 1.0);
    vec3 col = mix(uDeep, uShallow, depth);

    // Specular glints along the crests.
    float crest = smoothstep(0.03, 0.075, vWave);
    col += uSun * crest * 0.35;

    // Thin foam lines that drift with the swell.
    float foam = smoothstep(0.96, 1.0, sin(vWorld.x * 0.55 + vWorld.z * 0.31 + uTime * 0.8));
    col = mix(col, vec3(1.0), foam * 0.12);

    gl_FragColor = vec4(col, uOpacity);
  }
`;

/** A single animated plane covering the map; land pokes through it. */
export class WaterRenderer {
  readonly mesh: Mesh;
  private material: ShaderMaterial;

  constructor(map: TileMap, palette: SeasonPalette) {
    const geo = new PlaneGeometry(map.width + 8, map.height + 8, 96, 96);
    this.material = new ShaderMaterial({
      uniforms: {
        uTime: new Uniform(0),
        uShallow: new Uniform(palette.waterShallow.clone()),
        uDeep: new Uniform(palette.waterDeep.clone()),
        uSun: new Uniform(new Color(1, 0.94, 0.82)),
        uOpacity: new Uniform(0.92),
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      side: DoubleSide,
      depthWrite: true,
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.name = 'water';
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(map.width / 2, WATER_Y, map.height / 2);
    this.mesh.renderOrder = 1;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.updateMatrix();
  }

  setPalette(p: SeasonPalette): void {
    (this.material.uniforms.uShallow.value as Color).copy(p.waterShallow);
    (this.material.uniforms.uDeep.value as Color).copy(p.waterDeep);
  }

  setSunColor(c: Color): void {
    (this.material.uniforms.uSun.value as Color).copy(c);
  }

  update(time: number): void {
    this.material.uniforms.uTime.value = time;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
