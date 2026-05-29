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
}

export interface PilotConfig {
  name: string;
  cardPrefix: string;
  startingCardNumber: number;
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
