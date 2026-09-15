/**
 * Convite de colaborador em um card entre setores.
 *
 * O que precisa valer: o convidado enxerga AQUELE card e nada mais do pipe
 * alheio; consegue comentar e mexer no checklist; e NÃO consegue mover,
 * arquivar nem repassar o acesso.
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

describe("Colaborador convidado em card (pglite)", () => {
  let db: PGlite;

  let adminId: string; // dona da organização
  let comprasId: string; // membro do pipe Compras
  let orcamentoId: string; // membro do pipe Orçamentos — o convidado
  let outsiderId: string; // outra organização

  let orgId: string;
  let comprasPipeId: string;
  let phaseOpenId: string;
  let phaseDoneId: string;
  let cardA: string; // card do convite
  let cardB: string; // outro card do mesmo pipe, que deve continuar oculto

  async function cardsVisibleTo(userId: string): Promise<string[]> {
    const result = await runAsUser(db, userId, () =>
      db.query<{ id: string }>(`select id from cards order by number`),
    );
    return result.rows.map((r) => r.id);
  }

  beforeAll(async () => {
    db = await createTestDatabase();

    adminId = await createAuthUser(db, "collab-admin@example.com");
    comprasId = await createAuthUser(db, "collab-compras@example.com");
    orcamentoId = await createAuthUser(db, "collab-orcamento@example.com");
    outsiderId = await createAuthUser(db, "collab-outsider@example.com");

    const org = await runAsUser(db, adminId, () =>
      db.query<{ id: string }>(`select * from create_organization_with_owner($1, $2)`, [
        "Deck",
        "deck-collab",
      ]),
    );
    orgId = org.rows[0]!.id;

    await runAsUser(db, outsiderId, () =>
      db.query(`select * from create_organization_with_owner($1, $2)`, ["Outra", "outra-collab"]),
    );

    for (const [id, nome] of [
      [comprasId, "Isabele"],
      [orcamentoId, "Higor"],
    ] as const) {
      await runAsService(db, () =>
        db.query(
          `insert into organization_memberships (organization_id, user_id, role_id, status)
           select $1, $2, r.id, 'active' from roles r where r.key = 'member'`,
          [orgId, id],
        ),
      );
      await runAsService(db, () =>
        db.query(`update profiles set full_name = $2 where id = $1`, [id, nome]),
      );
    }
    await runAsService(db, () =>
      db.query(`update profiles set full_name = 'Bruno' where id = $1`, [adminId]),
    );

    // Pipe Compras, restrito: só a Isabele entra.
    const pipe = await runAsUser(db, adminId, () =>
      insertReturning<{ id: string }>(db, "pipes", {
        organization_id: orgId,
        name: "Compras",
        created_by: adminId,
        is_restricted: true,
      }),
    );
    comprasPipeId = pipe.id;

    await runAsUser(db, adminId, () =>
      db.query(`insert into pipe_memberships (pipe_id, user_id, added_by) values ($1, $2, $3)`, [
        comprasPipeId,
        comprasId,
        adminId,
      ]),
    );

    phaseOpenId = (
      await runAsUser(db, adminId, () =>
        insertReturning<{ id: string }>(db, "phases", {
          pipe_id: comprasPipeId,
          name: "Cotação",
          position: 0,
          is_initial: true,
        }),
      )
    ).id;
    phaseDoneId = (
      await runAsUser(db, adminId, () =>
        insertReturning<{ id: string }>(db, "phases", {
          pipe_id: comprasPipeId,
          name: "Concluído",
          position: 1,
          is_final: true,
        }),
      )
    ).id;

    // Cards criados pelo admin: a numeração automática faz UPDATE em
    // `pipes`, cuja policy exige admin — um `member` não consegue criar
    // card nem no próprio pipe. É o comportamento já existente do sistema,
    // não algo que este teste esteja exercitando.
    cardA = (
      await runAsUser(db, adminId, () =>
        insertReturning<{ id: string }>(db, "cards", {
          pipe_id: comprasPipeId,
          current_phase_id: phaseOpenId,
          title: "Cotação de esquadrias",
          created_by: adminId,
        }),
      )
    ).id;

    cardB = (
      await runAsUser(db, adminId, () =>
        insertReturning<{ id: string }>(db, "cards", {
          pipe_id: comprasPipeId,
          current_phase_id: phaseOpenId,
          title: "Compra de cimento",
          created_by: adminId,
        }),
      )
    ).id;
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it("antes do convite, Higor não vê nenhum card de Compras", async () => {
    expect(await cardsVisibleTo(orcamentoId)).toHaveLength(0);
  });

  it("Isabele convida Higor para o card A", async () => {
    await runAsUser(db, comprasId, () =>
      db.query(
        `insert into card_collaborators (card_id, user_id, invited_by, request)
         values ($1, $2, $3, $4)`,
        [cardA, orcamentoId, comprasId, "Preciso dos valores até sexta"],
      ),
    );

    const rows = await runAsUser(db, orcamentoId, () =>
      db.query<{ request: string }>(`select request from card_collaborators`),
    );
    expect(rows.rows[0]!.request).toBe("Preciso dos valores até sexta");
  });

  it("Higor passa a ver o card A, e SÓ ele", async () => {
    const visible = await cardsVisibleTo(orcamentoId);
    expect(visible).toEqual([cardA]);
    expect(visible).not.toContain(cardB);
  });

  it("o convite gera notificação para o convidado, com o pedido no corpo", async () => {
    const notifs = await runAsUser(db, orcamentoId, () =>
      db.query<{ title: string; body: string }>(
        `select title, body from notifications order by created_at desc limit 1`,
      ),
    );
    expect(notifs.rows[0]!.title).toBe("Isabele pediu sua ajuda em uma atividade");
    expect(notifs.rows[0]!.body).toContain("Cotação de esquadrias");
    expect(notifs.rows[0]!.body).toContain("Preciso dos valores até sexta");
  });

  it("Higor consegue comentar no card", async () => {
    await runAsUser(db, orcamentoId, () =>
      db.query(`insert into comments (card_id, author_id, body) values ($1, $2, $3)`, [
        cardA,
        orcamentoId,
        "Três fornecedores cotados, envio amanhã.",
      ]),
    );
    const comments = await runAsUser(db, orcamentoId, () =>
      db.query(`select id from comments where card_id = $1`, [cardA]),
    );
    expect(comments.rows).toHaveLength(1);
  });

  it("Higor consegue marcar item do checklist", async () => {
    const item = await runAsUser(db, comprasId, () =>
      insertReturning<{ id: string }>(db, "checklist_items", {
        card_id: cardA,
        title: "Cotar com 3 fornecedores",
        created_by: comprasId,
      }),
    );

    await runAsUser(db, orcamentoId, () =>
      db.query(`update checklist_items set is_done = true where id = $1`, [item.id]),
    );

    const done = await runAsUser(db, orcamentoId, () =>
      db.query<{ is_done: boolean }>(`select is_done from checklist_items where id = $1`, [item.id]),
    );
    expect(done.rows[0]!.is_done).toBe(true);
  });

  describe("limites do convite", () => {
    it("Higor NÃO consegue mover o card de fase", async () => {
      await expect(
        runAsUser(db, orcamentoId, () => db.query(`select * from move_card($1, $2)`, [cardA, phaseDoneId])),
      ).rejects.toThrow();
    });

    it("Higor NÃO consegue arquivar o card", async () => {
      await runAsUser(db, orcamentoId, () =>
        db.query(`update cards set is_archived = true where id = $1`, [cardA]),
      );
      // A policy de update filtra a linha: nada muda, sem erro.
      const row = await runAsUser(db, comprasId, () =>
        db.query<{ is_archived: boolean }>(`select is_archived from cards where id = $1`, [cardA]),
      );
      expect(row.rows[0]!.is_archived).toBe(false);
    });

    it("Higor NÃO consegue convidar outra pessoa para o card", async () => {
      // Convidado não repassa acesso: só membro do pipe convida.
      await runAsUser(db, orcamentoId, () =>
        db
          .query(
            `insert into card_collaborators (card_id, user_id, invited_by) values ($1, $2, $3)`,
            [cardA, adminId, orcamentoId],
          )
          .catch(() => undefined),
      );
      const rows = await runAsUser(db, comprasId, () =>
        db.query(`select id from card_collaborators where card_id = $1`, [cardA]),
      );
      expect(rows.rows).toHaveLength(1);
    });

    it("Higor NÃO vê as fases nem os campos do pipe de Compras", async () => {
      const phases = await runAsUser(db, orcamentoId, () =>
        db.query(`select id from phases where pipe_id = $1`, [comprasPipeId]),
      );
      expect(phases.rows).toHaveLength(0);
    });

    it("ninguém de fora da organização entra por convite", async () => {
      await expect(
        runAsUser(db, comprasId, () =>
          db.query(
            `insert into card_collaborators (card_id, user_id, invited_by) values ($1, $2, $3)`,
            [cardB, outsiderId, comprasId],
          ),
        ),
      ).rejects.toThrow();
    });

    it("não dá para convidar em nome de outra pessoa", async () => {
      await expect(
        runAsUser(db, comprasId, () =>
          db.query(
            `insert into card_collaborators (card_id, user_id, invited_by) values ($1, $2, $3)`,
            [cardB, orcamentoId, adminId],
          ),
        ),
      ).rejects.toThrow();
    });
  });

  describe("remoção do convite", () => {
    it("removido o convite, Higor deixa de ver o card", async () => {
      await runAsUser(db, comprasId, () =>
        db.query(`delete from card_collaborators where card_id = $1 and user_id = $2`, [
          cardA,
          orcamentoId,
        ]),
      );
      expect(await cardsVisibleTo(orcamentoId)).toHaveLength(0);
    });

    it("o convidado pode sair sozinho", async () => {
      await runAsUser(db, comprasId, () =>
        db.query(
          `insert into card_collaborators (card_id, user_id, invited_by) values ($1, $2, $3)`,
          [cardA, orcamentoId, comprasId],
        ),
      );
      expect(await cardsVisibleTo(orcamentoId)).toEqual([cardA]);

      await runAsUser(db, orcamentoId, () =>
        db.query(`delete from card_collaborators where user_id = $1`, [orcamentoId]),
      );
      expect(await cardsVisibleTo(orcamentoId)).toHaveLength(0);
    });
  });
});
