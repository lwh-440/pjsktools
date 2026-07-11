import { regions } from "./config.js";

export interface MasterSyncResult {
  region: string;
  repository: string;
  status: "planned";
}

export async function planMasterSync(): Promise<MasterSyncResult[]> {
  return regions.map((region) => ({
    region: region.id,
    repository: region.repository,
    status: "planned"
  }));
}
