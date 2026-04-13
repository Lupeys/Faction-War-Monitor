export type MemberStatus = 'Hospital' | 'Traveling' | 'Abroad' | 'Okay' | 'Offline';
export type ActivityState = 'Online' | 'Offline' | 'Idle' | 'Hospital' | 'Traveling' | 'In jail' | 'In federal';

export interface TornMember {
  id: number;
  name: string;
  level: number;
  rank: string;
  bstats: number;
  bstatsDisplay: string;   // "2.53b" human-readable
  bstats_age: string;     // "Updated today" | "2 months old" etc
  fairFight: number;      // e.g. 23.94
  position: string;
  status: MemberStatus;
  statusDescription: string;
  lastAction: number;
  lastActionRelative: string;
  activity: ActivityState;
  attacks: number;
  useref: number;
}

export type FilterTab =
  | 'all'
  | 'hittable'
  | 'hospital'
  | 'travel'
  | 'online'
  | 'offline'
  | 'idle';

export interface FilterState {
  activeTab: FilterTab;
  minLevel: number;
  maxLevel: number;
  minBstats: number;
  maxBstats: number;
}

export type ViewMode = 'faction' | 'targets';