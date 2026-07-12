// Stable ids for i18n lookup only — the value written to an item is the translated label.
export const AISLE_PRESET_IDS = [
  "produce",
  "dairy",
  "bakery",
  "meat",
  "seafood",
  "frozen",
  "pantry",
  "beverages",
  "snacks",
  "household",
  "personalCare",
] as const;

export type AislePresetId = (typeof AISLE_PRESET_IDS)[number];
