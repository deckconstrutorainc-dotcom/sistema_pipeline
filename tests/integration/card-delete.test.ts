/**
 * Exclusão permanente de card.
 *
 * O que precisa valer: só admin apaga; membro comum e convidado não; e a
 * exclusão deixa rastro em `domain_events`, já que `card_activities`
 * cascateia junto com o card.
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

describe("Exclusão de card (pglite)", () => {
  let db: PGlite;

  let adminId: string;
  let memberId: string;

  let orgId: string;
  let pipeId: string;
  let phaseId: string;

  async function createCard(title: string): Promise<{ id: string; number: number }> {
    return runAsUser(db, memberId, () =>
      insertReturning<{ id: string; number: number }>(db, "cards", {
        pipe_id: pipeId,
        current_phase_id: phaseId,
        title,
        created_by: memberId,
      }),
    );
  }

  async function cardExists(cardId: string): Promise<boolean> {
    const result = await runAsService(db, () =>
      db.query(`select id from cards where id = $1`, [cardId]),
    );
    return result.rows.length > 0;
  }

  beforeAll(async () => {
    db = await createTestDatabase();

    adminId = await createAuthUser(db, "delete-admin@example.com");
    memberId = await createAuthUser(db, "delete-member@example.com");

    const org = await runAsUser(db, adminId, () =>
      db.query<{ id: string }>(`select * from create_organization_with_owner($1, $2)`, [
        "Deck",
        "deck-delete",
      ]),
    );
    orgId = org.rows[0]!.id;

    await runAsService(db, () =>
      db.query(
        `insert into organization_memberships (organization_id, user_id, role_id, status)
         select $1, $2, r.id, 'active' from roles r where r.key = 'member'`,
        [orgId, memberId],
      ),
    );

    const pipe = await runAsUser(db, adminId, () =>
      insertReturning<{ id: string }>(db, "pipes", {
        organization_id: orgId,
        name: "Compras",
        created_by: adminId,
      }),
    );
    pipeId = pipe.id;

    phaseId = (
      await runAsUser(db, adminId, () =>
        insertReturning<{ id: string }>(db, "phases", {
          pipe_id: pipeId,
          name: "Entrada",
          position: 0,
          is_initial: true,
        }),
      )
    ).id;
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it("admin exclui o card", async () => {
    const card = await createCard("Card a excluir");
    await runAsUser(db, adminId, () => db.query(`delete from cards where id = $1`, [card.id]));
    expect(await cardExists(card.id)).toBe(false);
  });

  it("membro comum NÃO exclui — a RLS filtra sem erro", async () => {
    const card = await createCard("Card protegido");

    // Sem policy que o alcance, o DELETE não erra: apenas não afeta linha
    // nenhuma. É por isso que a action confere o `count` antes de dizer
    // que deu certo.
    await runAsUser(db, memberId, () => db.query(`delete from cards where id = $1`, [card.id]));

    expect(await cardExists(card.id)).toBe(true);
  });

  it("membro continua podendo arquivar", async () => {
    const card = await createCard("Card a arquivar");
    await runAsUser(db, memberId, () =>
      db.query(`update cards set is_archived = true where id = $1`, [card.id]),
    );
    const row = await runAsService(db, () =>
      db.query<{ is_archived: boolean }>(`select is_archived from cards where id = $1`, [card.id]),
    );
    expect(row.rows[0]!.is_archived).toBe(true);
  });

  it("a exclusão fica registrada em domain_events", async () => {
    const card = await createCard("Card com rastro");
    await runAsUser(db, adminId, () => db.query(`delete from cards where id = $1`, [card.id]));

    const events = await runAsService(db, () =>
      db.query<{ event_type: string; payload: Record<string, unknown> }>(
        `select event_type, payload from domain_events
         where entity_id = $1 and event_type = 'card.deleted'`,
        [card.id],
      ),
    );

    expect(events.rows).toHaveLength(1);
    expect(events.rows[0]!.payload.title).toBe("Card com rastro");
    expect(events.rows[0]!.payload.number).toBe(card.number);
    expect(events.rows[0]!.payload.deleted_by).toBe(adminId);
  });

  it("excluir leva junto comentários, checklist e conexões", async () => {
    const card = await createCard("Card com conteúdo");

    await runAsUser(db, memberId, () =>
      db.query(`insert into comments (card_id, author_id, body) values ($1, $2, $3)`, [
        card.id,
        memberId,
        "Um comentário",
      ]),
    );
    await runAsUser(db, memberId, () =>
      db.query(`insert into checklist_items (card_id, title, created_by) values ($1, $2, $3)`, [
        card.id,
        "Um item",
        memberId,
      ]),
    );

    await runAsUser(db, adminId, () => db.query(`delete from cards where id = $1`, [card.id]));

    const comments = await runAsService(db, () =>
      db.query(`select id from comments where card_id = $1`, [card.id]),
    );
    const checklist = await runAsService(db, () =>
      db.query(`select id from checklist_items where card_id = $1`, [card.id]),
    );

    expect(comments.rows).toHaveLength(0);
    expect(checklist.rows).toHaveLength(0);
  });

  it("a numeração não reaproveita o número de um card excluído", async () => {
    // O contador do pipe é monotônico: reaproveitar números faria duas
    // atividades diferentes compartilharem "#7" no histórico e nos e-mails.
    const primeiro = await createCard("Primeiro");
    await runAsUser(db, adminId, () => db.query(`delete from cards where id = $1`, [primeiro.id]));

    const segundo = await createCard("Segundo");
    expect(segundo.number).toBeGreaterThan(primeiro.number);
  });
});
