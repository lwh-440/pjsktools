declare module "pg" {
  export interface PoolClient {
    query<T = any>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
    release(): void;
  }

  export class Pool {
    constructor(options?: { connectionString?: string });
    query<T = any>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
  }
}
