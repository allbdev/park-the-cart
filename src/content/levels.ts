import type { Level } from "../core/level";
import l01 from "./levels/01-seniors-space.json";
import l02 from "./levels/02-sunday-morning.json";
import l03 from "./levels/03-speed-bump.json";
import l04 from "./levels/04-abandoned-cart.json";
import l05 from "./levels/05-the-slope.json";
import l06 from "./levels/06-wind.json";
import l07 from "./levels/07-rain.json";
import l08 from "./levels/08-black-friday.json";
import l09 from "./levels/09-managers-car.json";
import l10 from "./levels/10-rush-hour.json";

/**
 * The ten levels, in order. Names are in the locale files under `levels.<key>`; each level's
 * JSON is checked by the validator and its par run replayed in tests/content/levels.test.ts.
 */
export interface LevelEntry {
  number: number;
  /** Locale key under `levels.*`. */
  key: string;
  level: Level;
}

const RAW: [string, unknown][] = [
  ["seniorsSpace", l01],
  ["sundayMorning", l02],
  ["speedBump", l03],
  ["abandonedCart", l04],
  ["slope", l05],
  ["wind", l06],
  ["rain", l07],
  ["blackFriday", l08],
  ["managersCar", l09],
  ["rushHour", l10],
];

export const LEVELS: readonly LevelEntry[] = RAW.map(([key, json], i) => ({
  number: i + 1,
  key,
  level: json as Level,
}));

export function levelById(id: string): LevelEntry | undefined {
  return LEVELS.find((l) => l.level.id === id);
}
