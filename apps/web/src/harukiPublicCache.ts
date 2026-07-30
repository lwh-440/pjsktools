import type { CachedHarukiPublicSnapshot, HarukiPublicSnapshot, HarukiRegion } from "./harukiTypes";

const DATABASE_NAME = "pjsktools-player-data";
const DATABASE_VERSION = 1;
const STORE_NAME = "haruki-public-snapshots";

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("浏览器本地数据操作失败。"));
  });
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "cacheKey" });
        store.createIndex("userId", "userId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开浏览器本地数据。"));
  });
}

export function publicSnapshotCacheKey(userId: string, region: HarukiRegion, playerUid: string) {
  return `${userId}:${region}:${playerUid}`;
}

export async function putHarukiPublicSnapshot(userId: string, value: HarukiPublicSnapshot) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const cached: CachedHarukiPublicSnapshot = {
      ...value,
      userId,
      cacheKey: publicSnapshotCacheKey(userId, value.region, value.playerUid)
    };
    await requestResult(transaction.objectStore(STORE_NAME).put(cached));
    return cached;
  } finally {
    database.close();
  }
}

export async function getHarukiPublicSnapshot(userId: string, region: HarukiRegion, playerUid: string) {
  const database = await openDatabase();
  try {
    return await requestResult(
      database
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .get(publicSnapshotCacheKey(userId, region, playerUid))
    ) as CachedHarukiPublicSnapshot | undefined;
  } finally {
    database.close();
  }
}

export async function listHarukiPublicSnapshots(userId: string) {
  const database = await openDatabase();
  try {
    const records = await requestResult(
      database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).index("userId").getAll(userId)
    ) as CachedHarukiPublicSnapshot[];
    return records.sort((left, right) => Date.parse(right.fetchedAt) - Date.parse(left.fetchedAt));
  } finally {
    database.close();
  }
}

export async function deleteHarukiPublicSnapshot(userId: string, region: HarukiRegion, playerUid: string) {
  const database = await openDatabase();
  try {
    await requestResult(
      database
        .transaction(STORE_NAME, "readwrite")
        .objectStore(STORE_NAME)
        .delete(publicSnapshotCacheKey(userId, region, playerUid))
    );
  } finally {
    database.close();
  }
}

