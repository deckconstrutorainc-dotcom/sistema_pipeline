/**
 * Regressão: um membro comum precisa conseguir criar card.
 *
 * `assign_card_number()` incrementa `pipes.next_card_number` por UPDATE.
 * Sem `security definer`, esse UPDATE passava pela RLS de `pipes` — que
 * exige admin — e a criação falhava para todo mundo que não fosse
 * administrador, com a mensagem enganosa "Pipe inexistente para geração do
 * número do card."
 *
 * MODO PGlite (roda sempre): Postgres real (WASM), sem Docker.
 */
// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createAuthUser,
  createTestDatabase,
  insertReturning,
  runAsService,
  runAsUser,
} from "./setup/pglite-supabase";

describe("Criação de card por membro comum (pglite)", () => {
  let db: PGlite;

  let adminId: string;
  let memberId: string;
  let strangerId: string; // membro da organização, fora do pipe restrito

  let orgId: string;
  let openPipeId: string;
  let openPhaseId: string;
  let restrictedPipeId: string;
  let restrictedPhaseId: string;

  beforeAll(async () => {
    db = await createTestDatabase();

    adminId = await createAuthUser(db, "numbering-admin@example.com");
    memberId = await createAuthUser(db, "numbering-member@example.com");
    strangerId = await createAuthUser(db, "numbering-stranger@example.com");

    const org = await runAsUser(db, adminId, () =>
      db.query<{ id: string }>(`select * from create_organization_with_owner($1, $2)`, [
        "Deck",
        "deck-numbering",
      ]),
    );
    orgId = org.rows[0]!.id;

    for (const id of [memberId, strangerId]) {
      await runAsService(db, () =>
        db.query(
          `insert into organization_memberships (organization_id, user_id, role_id, status)
           select $1, $2, r.id, 'active' from roles r where r.key = 'member'`,
          [orgId, id],
        ),
      );
    }

    const openPipe = await runAsUser(db, adminId, () =>
      insertReturning<{ id: string }>(db, "pipes", {
        organization_id: orgId,
        name: "Aberto",
        created_by: adminId,
      }),
    );
    openPipeId = openPipe.id;
    openPhaseId = (
      await runAsUser(db, adminId, () =>
        insertReturning<{ id: string }>(db, "phases", {
          pipe_id: openPipeId,
          name: "Entrada",
          position: 0,
          is_initial: true,
        }),
      )
    ).id;

    const restrictedPipe = await runAsUser(db, adminId, () =>
      insertReturning<{ id: string }>(db, "pipes", {
        organization_id: orgId,
        name: "Restrito",
        created_by: adminId,
        is_restricted: true,
      }),
    );
    restrictedPipeId = restrictedPipe.id;
    restrictedPhaseId = (
      await runAsUser(db, adminId, () =>
        insertReturning<{ id: string }>(db, "phases", {
          pipe_id: restrictedPipeId,
          name: "Entrada",
          position: 0,
          is_initial: true,
        }),
      )
    ).id;

    await runAsUser(db, adminId, () =>
      db.query(`insert into pipe_memberships (pipe_id, user_id, added_by) values ($1, $2, $3)`, [
        restrictedPipeId,
        memberId,
        adminId,
      ]),
    );
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it("membro comum cria card em pipe aberto", async () => {
    const card = await runAsUser(db, memberId, () =>
      insertReturning<{ id: string; number: number }>(db, "cards", {
        pipe_id: openPipeId,
        current_phase_id: openPhaseId,
        title: "Primeira atividade",
        created_by: memberId,
      }),
    );
    expect(card.number).toBe(1);
  });

  it("membro do pipe restrito cria card nele", async () => {
    const card = await runAsUser(db, memberId, () =>
      insertReturning<{ id: string; number: number }>(db, "cards", {
        pipe_id: restrictedPipeId,
        current_phase_id: restrictedPhaseId,
        title: "Atividade do setor",
        created_by: memberId,
      }),
    );
    expect(card.number).toBe(1);
  });

  it("numeração segue sequencial e é independente por pipe", async () => {
    const segundo = await runAsUser(db, memberId, () =>
      insertReturning<{ number: number }>(db, "cards", {
        pipe_id: openPipeId,
        current_phase_id: openPhaseId,
        title: "Segunda atividade",
        created_by: memberId,
      }),
    );
    expect(segundo.number).toBe(2);

    const outroPipe = await runAsUser(db, memberId, () =>
      insertReturning<{ number: number }>(db, "cards", {
        pipe_id: restrictedPipeId,
        current_phase_id: restrictedPhaseId,
        title: "Segunda do setor",
        created_by: memberId,
      }),
    );
    expect(outroPipe.number).toBe(2);
  });

  it("security definer no trigger NÃO abre a porta para editar o pipe", async () => {
    // O contorno não pode ter virado uma brecha: renomear o pipe continua
    // restrito a admin.
    await runAsUser(db, memberId, () =>
      db.query(`update pipes set name = 'Invadido' where id = $1`, [openPipeId]),
    );
    const row = await runAsUser(db, adminId, () =>
      db.query<{ name: string }>(`select name from pipes where id = $1`, [openPipeId]),
    );
    expect(row.rows[0]!.name).toBe("Aberto");
  });

  it("quem não é do pipe restrito continua sem criar card nele", async () => {
    await expect(
      runAsUser(db, strangerId, () =>
        insertReturning(db, "cards", {
          pipe_id: restrictedPipeId,
          current_phase_id: restrictedPhaseId,
          title: "Não deveria entrar",
          created_by: strangerId,
        }),
      ),
    ).rejects.toThrow();
  });
});
