// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";

import {
  createAuthUser,
  createTestDatabase,
  insertReturning,
  listMigrationFiles,
  runAsService,
  runAsUser,
} from "./setup/pglite-supabase";

describe("[smoke] harness pglite-supabase", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createTestDatabase();
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it(`aplicou todas as ${listMigrationFiles().length} migrations + seed.sql sem erro`, async () => {
    const result = await db.query("select count(*)::int as n from public.roles");
    expect((result.rows[0] as { n: number }).n).toBeGreaterThan(0);
  });

  it("cria dois tenants e confirma isolamento via RLS real", async () => {
    const userAId = await createAuthUser(db, "smoke-a@example.com");
    const userBId = await createAuthUser(db, "smoke-b@example.com");

    const orgA = await runAsUser(db, userAId, () =>
      db.query<{ id: string; name: string }>(`select * from create_organization_with_owner($1, $2)`, [
        "Smoke A",
        "smoke-org-a",
      ]),
    );
    const orgAId = orgA.rows[0]!.id;

    await runAsUser(db, userBId, () =>
      db.query(`select * from create_organization_with_owner($1, $2)`, ["Smoke B", "smoke-org-b"]),
    );

    const seenByA = await runAsUser(db, userAId, () => db.query(`select id from organizations where id = $1`, [orgAId]));
    expect(seenByA.rows).toHaveLength(1);

    const seenByB = await runAsUser(db, userBId, () => db.query(`select id from organizations where id = $1`, [orgAId]));
    expect(seenByB.rows).toHaveLength(0);

    const seenByService = await runAsService(db, () => db.query(`select id from organizations`));
    expect(seenByService.rows.length).toBeGreaterThanOrEqual(2);
  });

  it("insertReturning contorna a particularidade de INSERT+RETURNING do PGlite", async () => {
    const userId = await createAuthUser(db, "smoke-c@example.com");
    const org = await runAsUser(db, userId, () =>
      db.query<{ id: string }>(`select * from create_organization_with_owner($1, $2)`, ["Smoke C", "smoke-org-c"]),
    );
    const orgId = org.rows[0]!.id;

    const pipe = await runAsUser(db, userId, () =>
      insertReturning<{ id: string; name: string }>(db, "pipes", {
        organization_id: orgId,
        name: "Pipe Smoke",
        created_by: userId,
      }),
    );
    expect(pipe.id).toBeTruthy();
    expect(pipe.name).toBe("Pipe Smoke");
  });
});
