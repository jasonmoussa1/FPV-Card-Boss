/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface FpvAssignment {
  daySection: string;
  pilot: string;
  assignment: string;
  flyTime: string;
  notes: string;
  setTime?: string;
  stage?: string;
  dropTime?: string;
}

export type ShotStatus = 'pending' | 'completed' | 'skipped';

export interface ShotListItem {
  id: string;          // stable unique id
  daySection: string;
  pilot: string;
  assignment: string;
  setTime: string;
  stage: string;
  flyTime: string;
  dropTime: string;
  notes: string;       // editable; seeded from CSV NOTES
  status: ShotStatus;
  manual: boolean;     // true if added by hand in-app (not from CSV)
  takes?: string;      // take count synced back from the mobile slate
}

export interface PilotConfig {
  name: string;
  cardPrefix: string;
  startingCardNumber: number;
  // Optional per-pilot drive overrides. When set, this pilot's files route to
  // these roots instead of the global mediaRootPath / bellaRootPath. Blank/undefined
  // = use the global default. Lets two pilots deliver to their own drives, switching
  // automatically with the active pilot.
  mediaRootPath?: string;
  bellaRootPath?: string;
}

export interface SimpleShowConfig {
  showName: string;
  pilotName: string;
  cardPrefix: string;
  startingCardNumber: number;
  localRootPath: string;
  mediaRootPath: string;
  sdCardDrive: string;
  goProOutputPath: string;
  recentArtists: string[];
  driveToggles: {
    mediaDrive: boolean;
  };
}

export interface FpvConfig {
  mode: 'festival' | 'simple';
  eventName: string;
  pilots: PilotConfig[];
  // activePilotIndex is the index into pilots[] for the currently selected pilot; -1 means no active pilot
  activePilotIndex: number;
  localRootPath: string;
  mediaRootPath: string;
  bellaRootPath: string;
  rawDumpPath?: string;
  // When true, AUTO mode includes the Raw dump step (still requires rawDumpPath set).
  autoDumpRaws?: boolean;
  // When true, the GoPro robot toggles Horizon Lock ON in the batch exporter
  // (requires the 'horizonLock' calibration point to be captured).
  horizonLock?: boolean;
  // When true, "Dual" stabilize mode runs each clip twice — regular, then Horizon
  // Lock — saving the Horizon Lock versions into a STABILIZED\HORIZON LOCK subfolder.
  dualMode?: boolean;
  sdCardDrive: string;
  goProAppPath: string;
  goProOutputPath?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  robotCoords: any;
  driveToggles: {
    mediaDrive: boolean;
    bellaDrive: boolean;
  };
  simpleConfig: SimpleShowConfig;
}

export type CardStatus =
  | 'Selected'
  | 'Skip'
  | 'Mixed/Unclear'
  | 'Complete';

export interface SimpleCardLog {
  cardId: string;
  artist: string;
  showName: string;
  pilotName: string;
  timestamp: string;
  localRawPath: string;
  localStabPath: string;
  mediaPath: string;
}

export interface ProcessedCard {
  id: string; // e.g. L_001
  cardPrefix: string;
  cardNumber: number;
  assignment: string;
  daySection: string;
  pilot: string;
  flyTime: string;
  status: CardStatus;
  size: string; // e.g., "45 GB"
  notes: string;
  rawPath: string;
  stabilizedPath: string;
  mediaDrivePath: string;
  bellaSocialPath: string;
  mediaMasterLine: string;
  timestamp: string;
}
