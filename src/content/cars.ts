/**
 * Parked cars and the price list. Prices are integer centavos and are placeholders to tune
 * (canvas board "Hazards and price list"). Names live in the locale files under `cars.*`.
 */

export type CarModel = "sedan" | "suv" | "pickup" | "hatch" | "manager";
export const CAR_MODELS: readonly CarModel[] = ["sedan", "suv", "pickup", "hatch", "manager"];

export type CarColour = "silver" | "white" | "black" | "red" | "blue" | "grey";
export const CAR_COLOURS: readonly CarColour[] = [
  "silver",
  "white",
  "black",
  "red",
  "blue",
  "grey",
];

export interface CarSpec {
  length: number;
  width: number;
}

export const CAR_SPECS: Record<CarModel, CarSpec> = {
  sedan: { length: 4.5, width: 1.8 },
  suv: { length: 4.7, width: 1.95 },
  pickup: { length: 5.3, width: 1.9 },
  hatch: { length: 4.0, width: 1.75 },
  manager: { length: 4.9, width: 1.9 },
};

export type Zone = "door" | "mirror" | "frontBumper" | "rearBumper";
export const ZONES: readonly Zone[] = ["door", "mirror", "frontBumper", "rearBumper"];

/** What each part of a car costs when the cart hits it. */
export const ZONE_PRICES: Record<Zone, number> = {
  door: 184_000,
  mirror: 62_000,
  frontBumper: 91_800,
  rearBumper: 91_800,
};

/** Hazards with their own line on the receipt. */
export const HAZARD_PRICES = {
  cone: 3_400,
  doorOpening: 184_000,
  reversing: 260_000,
} as const;
