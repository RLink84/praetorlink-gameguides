// The guide pack format. One pack per game. Every entry carries spoiler level, DLC flag and the story stage
// from which it may be shown. All text is written by PraetorLink in its own words; sources are kept per entry.

export type Spoiler = 0 | 1 | 2 | 3; // 0 name only, 1 premise/location, 2 steps/rewards, 3 outcomes/twists
export type Alignment = "good" | "evil" | "neutral";

export interface Base {
  id: string;
  name: string;
  spoiler: Spoiler;
  dlc: boolean;
  /** Story step id (pack.story) from which this entry becomes available in a playthrough. */
  stage: string;
  /** Source site keys (see pack.sourceList). */
  refs?: string[];
  verified?: boolean;
}

export interface Reward { outcome?: string; xp?: number; gold?: number; items?: string[]; unlocks?: string[] }

export interface Quest extends Base {
  kind: "main" | "side";
  area?: string;
  giver?: string;
  /** One short premise sentence (spoiler 1). */
  premise: string;
  /** How to start it (spoiler 1). */
  unlock?: string;
  requires?: string[];
  /** Story step id at which this quest can no longer be done. */
  locksAt?: string;
  timed?: boolean;
  /** What happens if a timed quest runs out. */
  failure?: string;
  missable?: boolean;
  level?: number;
  steps?: string[];
  /** One online page with maps and pictures for this quest (we link, never copy). */
  guideUrl?: string;
  /** Our own screenshots for this quest (files in packs/<game>/img/). */
  images?: QuestImage[];
  rewards?: Reward[];
  choices?: string[];
  related?: string[];
  tips?: string[];
  achievement?: string;
}

export interface ChoiceOption { label: string; result: string; alignment?: Alignment; reward?: string; links?: string[] }
export interface Choice extends Base { quest: string; prompt: string; options: ChoiceOption[]; advice?: string }

export type ItemCategory =
  | "weapon" | "shield" | "head" | "body" | "legs" | "cloak" | "ring"
  | "key" | "tome" | "consumable" | "material" | "collectible";

export interface ItemSource { kind: "shop" | "chest" | "drop" | "reward" | "tokens" | "gift" | "craft" | "other"; text: string; where?: string }

export interface Item extends Base {
  category: ItemCategory;
  type?: string;            // e.g. "Sword", "Archistaff"
  vocations?: string[];
  stats?: Record<string, number>;
  note?: string;
  sources: ItemSource[];
  usedBy?: string[];        // quest ids
}

export interface Area extends Base {
  region: string;
  parent?: string;
  summary: string;
  services?: string[];
  quests?: string[];
}

export interface Tip extends Base {
  topic: "leveling" | "riddle" | "ending" | "error" | "secret" | "boss" | "general";
  body: string;
  steps?: string[];
  platform?: string;
  level?: [number, number];
}

export interface StoryStep {
  id: string;
  name: string;
  dlc: boolean;
  /** "base" main story or "dlc" (Dark Arisen Norgan story). Positions are tracked per track. */
  track: "base" | "dlc";
  order: number;
  /** Rough recommended level (our estimate, labelled as such in the UI). */
  level?: number;
  /** Short spoiler-safe hint about this point in the story. */
  note?: string;
}

export interface Achievement {
  id: string;
  name: string;
  how: string;
  dlc: boolean;
  spoiler: Spoiler;
  /** Quest or story ids that this achievement proves are done. */
  marks: string[];
}

export interface QuestImage { file: string; caption: string; by?: string }

export interface Pack {
  game: string;
  title: string;
  version: string;
  minAppVersion: string;
  builtAt: string;
  disclaimer: string;
  /** Source key -> display name and site, for credits. */
  sourceList: Record<string, { name: string; url?: string }>;
  /** Interactive map to link to. */
  mapUrl?: string;
  story: StoryStep[];
  quests: Quest[];
  choices: Choice[];
  items: Item[];
  areas: Area[];
  tips: Tip[];
  achievements: Achievement[];
}

export interface Manifest { game: string; version: string; minAppVersion: string; url: string; sha256: string; size: number }
