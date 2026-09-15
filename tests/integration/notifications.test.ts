/**
 * Notificações internas: gatilhos, destinatários, deduplicação de prazo e
 * isolamento por usuário.
 *
 * MODO PGlite (roda sempre): Postgres real (WASM), sem Docker. Ver
 * `tests/integration/setup/pglite-supabase.ts`.
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

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read_at: string | null;
  card_id: string;
}

describe("Notificações — gatilhos, destinatários e isolamento (pglite)", () => {
  let db: PGlite;

  let ownerId: string; // A — dona da organização, cria os cards
  let memberId: string; // B — membro, recebe as notificações
  let outsiderId: string; // C — outra organização, não pode ver nada

  let orgId: string;
  let pipeId: string;
  let phaseOpenId: string;
  let phaseDoneId: string;
  let cardId: string;
  let relatedCardId: string;

  async function notificationsOf(userId: string): Promise<NotificationRow[]> {
    const result = await runAsUser(db, userId, () =>
      db.query<NotificationRow>(
        `select id, type, title, body, read_at, card_id from notifications order by created_at, type`,
      ),
    );
    return result.rows;
  }

  beforeAll(async () => {
    db = await createTestDatabase();

    ownerId = await createAuthUser(db, "notif-owner@example.com");
    memberId = await createAuthUser(db, "notif-member@example.com");
    outsiderId = await createAuthUser(db, "notif-outsider@example.com");

    const org = await runAsUser(db, ownerId, () =>
      db.query<{ id: string }>(`select * from create_organization_with_owner($1, $2)`, [
        "Notif Org",
        "notif-org-pglite",
      ]),
    );
    orgId = org.rows[0]!.id;

    await runAsUser(db, outsiderId, () =>
      db.query(`select * from create_organization_with_owner($1, $2)`, ["Outra Org", "notif-outra-org"]),
    );

    // B entra na organização A como membro comum. O pipe não é restrito,
    // então a participação na organização basta para acessar o card.
    await runAsService(db, () =>
      db.query(
        `insert into organization_memberships (organization_id, user_id, role_id, status)
         select $1, $2, r.id, 'active' from roles r where r.key = 'member'`,
        [orgId, memberId],
      ),
    );
    // `handle_new_user` já criou os profiles ao inserir em auth.users, com
    // full_name nulo — aqui só nomeamos, para conferir o texto das
    // notificações.
    await runAsService(db, () =>
      db.query(`update profiles set full_name = $2 where id = $1`, [ownerId, "Ana Dona"]),
    );
    await runAsService(db, () =>
      db.query(`update profiles set full_name = $2 where id = $1`, [memberId, "Beto Membro"]),
    );

    const pipe = await runAsUser(db, ownerId, () =>
      insertReturning<{ id: string }>(db, "pipes", {
        organization_id: orgId,
        name: "Compras",
        created_by: ownerId,
      }),
    );
    pipeId = pipe.id;

    phaseOpenId = (
      await runAsUser(db, ownerId, () =>
        insertReturning<{ id: string }>(db, "phases", {
          pipe_id: pipeId,
          name: "Aberto",
          position: 0,
          is_initial: true,
        }),
      )
    ).id;
    phaseDoneId = (
      await runAsUser(db, ownerId, () =>
        insertReturning<{ id: string }>(db, "phases", {
          pipe_id: pipeId,
          name: "Concluído",
          position: 1,
          is_final: true,
        }),
      )
    ).id;

    cardId = (
      await runAsUser(db, ownerId, () =>
        insertReturning<{ id: string }>(db, "cards", {
          pipe_id: pipeId,
          current_phase_id: phaseOpenId,
          title: "Cotação de cimento",
          created_by: ownerId,
        }),
      )
    ).id;
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it("começa sem notificações para ninguém", async () => {
    expect(await notificationsOf(ownerId)).toHaveLength(0);
    expect(await notificationsOf(memberId)).toHaveLength(0);
  });

  it("atribuir B ao card notifica B, com o nome de quem atribuiu", async () => {
    await runAsUser(db, ownerId, () =>
      db.query(`insert into card_assignments (card_id, user_id, assigned_by) values ($1, $2, $3)`, [
        cardId,
        memberId,
        ownerId,
      ]),
    );

    const mine = await notificationsOf(memberId);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.type).toBe("card_assigned");
    expect(mine[0]!.title).toBe("Você foi atribuído a uma atividade");
    expect(mine[0]!.body).toContain("#1 · Cotação de cimento");
    expect(mine[0]!.body).toContain("por Ana Dona");
    expect(mine[0]!.read_at).toBeNull();
  });

  it("atribuir a si mesmo não gera notificação", async () => {
    await runAsUser(db, ownerId, () =>
      db.query(`insert into card_assignments (card_id, user_id, assigned_by) values ($1, $2, $3)`, [
        cardId,
        ownerId,
        ownerId,
      ]),
    );
    expect(await notificationsOf(ownerId)).toHaveLength(0);
  });

  it("comentário de A notifica os participantes, exceto a própria A", async () => {
    await runAsUser(db, ownerId, () =>
      db.query(`insert into comments (card_id, author_id, body) values ($1, $2, $3)`, [
        cardId,
        ownerId,
        "Fornecedor habitual sem estoque.",
      ]),
    );

    const mine = await notificationsOf(memberId);
    const comment = mine.find((n) => n.type === "comment_added");
    expect(comment).toBeDefined();
    expect(comment!.title).toBe("Ana Dona comentou em #1 · Cotação de cimento");
    expect(comment!.body).toBe("Fornecedor habitual sem estoque.");

    // A é participante (criou e está atribuída), mas foi quem comentou.
    expect((await notificationsOf(ownerId)).filter((n) => n.type === "comment_added")).toHaveLength(0);
  });

  it("anexo de B notifica A (participante) e não B (quem anexou)", async () => {
    await runAsUser(db, memberId, () =>
      db.query(
        `insert into attachments (card_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
         values ($1, $2, $3, $4, $5, $6)`,
        [cardId, `${orgId}/${cardId}/nota.pdf`, "nota-fiscal.pdf", "application/pdf", 1024, memberId],
      ),
    );

    const ownerNotifs = await notificationsOf(ownerId);
    const attachment = ownerNotifs.find((n) => n.type === "attachment_added");
    expect(attachment).toBeDefined();
    expect(attachment!.title).toBe("Beto Membro anexou um arquivo em #1 · Cotação de cimento");
    expect(attachment!.body).toBe("nota-fiscal.pdf");

    expect((await notificationsOf(memberId)).filter((n) => n.type === "attachment_added")).toHaveLength(0);
  });

  it("concluir um card conectado avisa os participantes do card relacionado", async () => {
    // Card 2, só de A. Conectado ao card 1 (de A e B).
    relatedCardId = (
      await runAsUser(db, ownerId, () =>
        insertReturning<{ id: string }>(db, "cards", {
          pipe_id: pipeId,
          current_phase_id: phaseOpenId,
          title: "Pedido ao fornecedor",
          created_by: ownerId,
        }),
      )
    ).id;

    await runAsUser(db, ownerId, () =>
      db.query(`insert into card_card_connections (card_id_a, card_id_b, created_by) values ($1, $2, $3)`, [
        cardId,
        relatedCardId,
        ownerId,
      ]),
    );

    const before = (await notificationsOf(memberId)).filter((n) => n.type === "related_card_completed");
    expect(before).toHaveLength(0);

    await runAsUser(db, ownerId, () => db.query(`select * from move_card($1, $2)`, [relatedCardId, phaseDoneId]));

    const after = (await notificationsOf(memberId)).filter((n) => n.type === "related_card_completed");
    expect(after).toHaveLength(1);
    expect(after[0]!.title).toBe("Atividade relacionada concluída");
    expect(after[0]!.body).toContain("#2 · Pedido ao fornecedor");
    expect(after[0]!.body).toContain("#1 · Cotação de cimento");
    // A notificação aponta para o card DE B, não para o que foi concluído.
    expect(after[0]!.card_id).toBe(cardId);
  });

  describe("verificação periódica de prazos", () => {
    it("card com prazo vencido gera card_overdue para os participantes", async () => {
      await runAsService(db, () =>
        db.query(`update cards set due_date = now() - interval '2 days' where id = $1`, [cardId]),
      );

      const created = await runAsService(db, () =>
        db.query<{ create_deadline_notifications: number }>(`select create_deadline_notifications()`),
      );
      // A e B são participantes do card 1.
      expect(created.rows[0]!.create_deadline_notifications).toBe(2);

      const overdue = (await notificationsOf(memberId)).filter((n) => n.type === "card_overdue");
      expect(overdue).toHaveLength(1);
      expect(overdue[0]!.title).toBe("Atividade atrasada");
      expect(overdue[0]!.body).toMatch(/#1 · Cotação de cimento — prazo \d{2}\/\d{2} \d{2}:\d{2}/);
    });

    it("rodar de novo no mesmo dia não duplica o aviso", async () => {
      const created = await runAsService(db, () =>
        db.query<{ create_deadline_notifications: number }>(`select create_deadline_notifications()`),
      );
      expect(created.rows[0]!.create_deadline_notifications).toBe(0);
      expect((await notificationsOf(memberId)).filter((n) => n.type === "card_overdue")).toHaveLength(1);
    });

    it("card que vence em menos de 24h gera card_due_soon uma única vez", async () => {
      await runAsService(db, () =>
        db.query(`update cards set due_date = now() + interval '6 hours' where id = $1`, [cardId]),
      );

      const first = await runAsService(db, () =>
        db.query<{ create_deadline_notifications: number }>(`select create_deadline_notifications()`),
      );
      expect(first.rows[0]!.create_deadline_notifications).toBe(2);

      const second = await runAsService(db, () =>
        db.query<{ create_deadline_notifications: number }>(`select create_deadline_notifications()`),
      );
      expect(second.rows[0]!.create_deadline_notifications).toBe(0);

      const dueSoon = (await notificationsOf(memberId)).filter((n) => n.type === "card_due_soon");
      expect(dueSoon).toHaveLength(1);
      expect(dueSoon[0]!.title).toBe("Atividade vence em menos de 24 horas");
    });

    it("card concluído ou arquivado não gera aviso de prazo", async () => {
      await runAsService(db, () =>
        db.query(`update cards set due_date = now() - interval '1 day' where id = $1`, [relatedCardId]),
      );
      const created = await runAsService(db, () =>
        db.query<{ create_deadline_notifications: number }>(`select create_deadline_notifications()`),
      );
      // relatedCard está is_done = true (foi para a fase final acima).
      expect(created.rows[0]!.create_deadline_notifications).toBe(0);
    });
  });

  describe("isolamento e permissões", () => {
    it("C, de outra organização, não vê nenhuma notificação", async () => {
      expect(await notificationsOf(outsiderId)).toHaveLength(0);

      const mine = await notificationsOf(memberId);
      const asOutsider = await runAsUser(db, outsiderId, () =>
        db.query(`select id from notifications where id = $1`, [mine[0]!.id]),
      );
      expect(asOutsider.rows).toHaveLength(0);
    });

    it("B marca a própria notificação como lida", async () => {
      const mine = await notificationsOf(memberId);
      const target = mine.find((n) => n.read_at === null)!;

      await runAsUser(db, memberId, () =>
        db.query(`update notifications set read_at = now() where id = $1`, [target.id]),
      );

      const after = await notificationsOf(memberId);
      expect(after.find((n) => n.id === target.id)!.read_at).not.toBeNull();
    });

    it("B não consegue alterar o título de uma notificação (só read_at é editável)", async () => {
      const mine = await notificationsOf(memberId);
      await expect(
        runAsUser(db, memberId, () =>
          db.query(`update notifications set title = 'hackeado' where id = $1`, [mine[0]!.id]),
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it("B não consegue inserir notificação diretamente", async () => {
      await expect(
        runAsUser(db, memberId, () =>
          db.query(
            `insert into notifications (organization_id, user_id, type, title)
             values ($1, $2, 'automation', 'spam')`,
            [orgId, ownerId],
          ),
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it("B não consegue chamar notify_users diretamente", async () => {
      await expect(
        runAsUser(db, memberId, () =>
          db.query(`select notify_users($1, array[$2]::uuid[], 'automation', null, 'spam', null)`, [
            cardId,
            ownerId,
          ]),
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it("B apaga a própria notificação, e não a de A", async () => {
      const ownerNotifs = await notificationsOf(ownerId);
      const ownerTarget = ownerNotifs[0]!;

      await runAsUser(db, memberId, () =>
        db.query(`delete from notifications where id = $1`, [ownerTarget.id]),
      );
      // RLS filtra a linha: nada é apagado, sem erro.
      expect((await notificationsOf(ownerId)).some((n) => n.id === ownerTarget.id)).toBe(true);

      const mine = await notificationsOf(memberId);
      await runAsUser(db, memberId, () => db.query(`delete from notifications where id = $1`, [mine[0]!.id]));
      expect((await notificationsOf(memberId)).some((n) => n.id === mine[0]!.id)).toBe(false);
    });
  });
});
