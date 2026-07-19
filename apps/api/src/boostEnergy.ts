export const boostEnergyRates = [1, 5, 10, 15, 20, 25, 27, 29, 31, 33, 35] as const;

export function getBoostEnergyRate(boost?: number) {
  const fires = Math.max(0, Math.min(10, Math.floor(boost ?? 0)));
  return boostEnergyRates[fires];
}
