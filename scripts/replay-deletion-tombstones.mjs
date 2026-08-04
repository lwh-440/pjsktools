import { createHmac } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";

const [mode, file] = process.argv.slice(2);
if (!['export', 'replay'].includes(mode) || !file) {
  throw new Error('Usage: node scripts/replay-deletion-tombstones.mjs <export|replay> <private-json-file>');
}
if (!process.env.DATABASE_URL || !process.env.DELETION_TOMBSTONE_KEY) {
  throw new Error('DATABASE_URL and DELETION_TOMBSTONE_KEY are required');
}

const hash = (kind, value) => createHmac('sha256', process.env.DELETION_TOMBSTONE_KEY)
  .update(`${kind}:${kind === 'email' ? String(value).trim().toLowerCase() : value}`)
  .digest('hex');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  if (mode === 'export') {
    const result = await pool.query('select user_hash, email_hash, deleted_at from account_deletion_tombstones order by deleted_at');
    await writeFile(file, JSON.stringify({ exportedAt: new Date().toISOString(), tombstones: result.rows }, null, 2), { mode: 0o600 });
    console.log(`Exported ${result.rowCount ?? 0} irreversible deletion tombstones.`);
  } else {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    const tombstones = Array.isArray(parsed.tombstones) ? parsed.tombstones : [];
    const userHashes = new Set(tombstones.map((item) => item.user_hash));
    const emailHashes = new Set(tombstones.map((item) => item.email_hash).filter(Boolean));
    const client = await pool.connect();
    try {
      await client.query('begin');
      for (const item of tombstones) {
        await client.query(
          `insert into account_deletion_tombstones (user_hash, email_hash, deleted_at)
           values ($1, $2, $3) on conflict (user_hash) do nothing`,
          [item.user_hash, item.email_hash ?? null, item.deleted_at]
        );
      }
      const users = await client.query('select id, email from users');
      let removed = 0;
      for (const user of users.rows) {
        if (userHashes.has(hash('user', user.id)) || (user.email && emailHashes.has(hash('email', user.email)))) {
          await client.query('delete from users where id = $1', [user.id]);
          removed += 1;
        }
      }
      await client.query('commit');
      console.log(`Replayed ${tombstones.length} tombstones and removed ${removed} restored accounts.`);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
