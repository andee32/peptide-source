import { pool } from "@app/db";

// Empties every table in the public schema between tests. Enumerating from
// information_schema rather than hardcoding a list means a newly added table is
// cleaned automatically instead of leaking rows into the next test.
export async function resetDb(): Promise<void> {
  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  );
  if (rows.length === 0) return;

  const list = rows.map((r) => `"${r.tablename}"`).join(", ");
  await pool.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
