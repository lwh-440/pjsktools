import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const batchSize = Math.min(10_000, Math.max(100, Number(process.env.RANKING_CLEANUP_BATCH_SIZE ?? 2000)));
const maxBatches = Math.min(1000, Math.max(1, Number(process.env.RANKING_CLEANUP_MAX_BATCHES ?? 20)));
const pauseMs = Math.min(10_000, Math.max(100, Number(process.env.RANKING_CLEANUP_PAUSE_MS ?? 1000)));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let total = 0;
try {
  for (let index = 0; index < maxBatches; index += 1) {
    const result = await pool.query(
      `with batch as (
         select id from ranking_history_samples
         where raw_payload <> '{}'::jsonb
         order by sampled_at asc limit $1
       )
       update ranking_history_samples target set raw_payload = '{}'::jsonb
       from batch where target.id = batch.id`,
      [batchSize]
    );
    const changed = result.rowCount ?? 0;
    total += changed;
    console.log(`Ranking payload cleanup batch ${index + 1}: ${changed} rows; total ${total}.`);
    if (changed < batchSize) break;
    await new Promise((resolve) => setTimeout(resolve, pauseMs));
  }
} finally {
  await pool.end();
}
