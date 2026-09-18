import type { BuildingId } from '../data/buildings';
import type { Simulation } from '../sim/simulation';
import type { World } from '../sim/world';

export type QualityLevel = 'low' | 'medium' | 'high';

export type SheetId =
  | 'build'
  | 'research'
  | 'trade'
  | 'people'
  | 'village'
  | 'building'
  | 'villager'
  | 'settings';

/** Everything the UI is allowed to do to the running game. */
export interface GameApi {
  readonly sim: Simulation;
  readonly world: World;

  speed: number;
  setSpeed(speed: number): void;
  togglePause(): void;

  /** Building placement mode. */
  readonly placementId: BuildingId | null;
  readonly placementRotation: number;
  beginPlacement(id: BuildingId): void;
  rotatePlacement(): void;
  cancelPlacement(): void;
  /** Builds at the ghost's position. Returns false when the spot is refused. */
  confirmPlacement(): boolean;
  /** Road painting keeps the mode active between taps. */
  readonly painting: boolean;
  /** Live feedback about the spot currently under the placement ghost. */
  readonly placementInfo: {
    valid: boolean;
    reason: string;
    resources: number;
    label: string;
  } | null;

  selectedBuildingId: number | null;
  selectedVillagerId: number | null;
  selectBuilding(id: number | null): void;
  selectVillager(id: number | null): void;

  focusOn(x: number, y: number, distance?: number): void;

  openSheet(id: SheetId): void;
  closeSheet(): void;
  readonly openSheetId: SheetId | null;

  save(): Promise<void>;
  load(): Promise<boolean>;
  hasSave(): Promise<boolean>;
  restart(seed?: string): void;

  quality: QualityLevel;
  setQuality(q: QualityLevel): void;
  showDebug: boolean;
  /** Refresh hook so panels can ask the shell to redraw immediately. */
  requestUiRefresh(): void;
}
