/**
 * Menções (@Nome) em comentários.
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

describe("Menções em comentários (pglite)", () => {
  let db: PGlite;

  let adminId: string;
  let anaId: string; // participante (responsável)
  let higorId: string; // não participante, mencionado
  let outsiderId: string; // outra organização

  let orgId: string;
  let pipeId: string;
  let cardId: string;

  async function notificationsOf(userId: string) {
    const result = await runAsUser(db, userId, () =>
      db.query<{ type: string; title: string; body: string }>(
        `select type, title, body from notifications order by created_at`,
      ),
    );
    return result.rows;
  }

  async function comment(authorId: string, body: string) {
    await runAsUser(db, authorId, () =>
      db.query(`insert into comments (card_id, author_id, body) values ($1, $2, $3)`, [
        cardId,
        authorId,
        body,
      ]),
    );
  }

  async function clearNotifications() {
    await runAsService(db, () => db.query(`delete from notifications`));
  }

  beforeAll(async () => {
    db = await createTestDatabase();

    adminId = await createAuthUser(db, "mention-admin@example.com");
    anaId = await createAuthUser(db, "mention-ana@example.com");
    higorId = await createAuthUser(db, "mention-higor@example.com");
    outsiderId = await createAuthUser(db, "mention-outsider@example.com");

    const org = await runAsUser(db, adminId, () =>
      db.query<{ id: string }>(`select * from create_organization_with_owner($1, $2)`, [
        "Deck",
        "deck-mention",
      ]),
    );
    orgId = org.rows[0]!.id;

    await runAsUser(db, outsiderId, () =>
      db.query(`select * from create_organization_with_owner($1, $2)`, ["Outra", "outra-mention"]),
    );

    for (const [id, nome] of [
      [anaId, "Ana Paula Souza"],
      [higorId, "Higor Mendes"],
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
      db.query(`update profiles set full_name = 'Bruno Ferreira' where id = $1`, [adminId]),
    );
    await runAsService(db, () =>
      db.query(`update profiles set full_name = 'Ana Externa' where id = $1`, [outsiderId]),
    );

    const pipe = await runAsUser(db, adminId, () =>
      insertReturning<{ id: string }>(db, "pipes", {
        organization_id: orgId,
        name: "Orçamentos",
        created_by: adminId,
      }),
    );
    pipeId = pipe.id;

    const phase = await runAsUser(db, adminId, () =>
      insertReturning<{ id: string }>(db, "phases", {
        pipe_id: pipeId,
        name: "Análise",
        position: 0,
        is_initial: true,
      }),
    );

    cardId = (
      await runAsUser(db, adminId, () =>
        insertReturning<{ id: string }>(db, "cards", {
          pipe_id: pipeId,
          current_phase_id: phase.id,
          title: "Proposta Edifício Aurora",
          created_by: adminId,
        }),
      )
    ).id;

    // Ana é responsável, portanto participante. Higor não.
    await runAsUser(db, adminId, () =>
      db.query(`insert into card_assignments (card_id, user_id, assigned_by) values ($1, $2, $3)`, [
        cardId,
        anaId,
        adminId,
      ]),
    );

    await clearNotifications();
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it("menciona pelo primeiro nome", async () => {
    await comment(adminId, "@Higor consegue cotar as esquadrias?");

    const higor = await notificationsOf(higorId);
    expect(higor).toHaveLength(1);
    expect(higor[0]!.title).toBe("Bruno Ferreira mencionou você em #1 · Proposta Edifício Aurora");
    expect(higor[0]!.body).toBe("@Higor consegue cotar as esquadrias?");

    await clearNotifications();
  });

  it("menciona pelo nome completo", async () => {
    await comment(adminId, "Favor verificar, @Higor Mendes");
    expect(await notificationsOf(higorId)).toHaveLength(1);
    await clearNotifications();
  });

  it("ignora maiúsculas e minúsculas", async () => {
    await comment(adminId, "@higor pode assumir?");
    expect(await notificationsOf(higorId)).toHaveLength(1);
    await clearNotifications();
  });

  it("menciona várias pessoas de uma vez", async () => {
    await comment(adminId, "@Ana e @Higor, alinhamos amanhã?");
    expect(await notificationsOf(higorId)).toHaveLength(1);
    // Ana é participante: recebe o aviso de comentário, não o de menção.
    expect(await notificationsOf(anaId)).toHaveLength(1);
    await clearNotifications();
  });

  it("quem é participante recebe um aviso só, não dois", async () => {
    await comment(adminId, "@Ana Paula Souza, confirma o valor?");
    const ana = await notificationsOf(anaId);
    expect(ana).toHaveLength(1);
    // O de participante, não o de menção — evita duplicar o mesmo fato.
    expect(ana[0]!.title).toContain("comentou em");
    await clearNotifications();
  });

  it("não notifica quem se menciona", async () => {
    await comment(higorId, "Eu, @Higor, assumo isso.");
    expect(await notificationsOf(higorId)).toHaveLength(0);
    await clearNotifications();
  });

  it("não notifica pessoa de outra organização", async () => {
    await comment(adminId, "@Ana Externa poderia ajudar?");
    expect(await notificationsOf(outsiderId)).toHaveLength(0);
    await clearNotifications();
  });

  it("nome sem @ não vira menção", async () => {
    await comment(adminId, "O Higor já respondeu por e-mail.");
    expect(await notificationsOf(higorId)).toHaveLength(0);
    await clearNotifications();
  });

  it("não casa nome dentro de outra palavra", async () => {
    // "@Higorzinho" não é o Higor.
    await comment(adminId, "@Higorzinho não existe.");
    expect(await notificationsOf(higorId)).toHaveLength(0);
    await clearNotifications();
  });

  it("comentário sem menção nenhuma não quebra", async () => {
    await comment(adminId, "Seguimos conforme combinado.");
    expect(await notificationsOf(higorId)).toHaveLength(0);
    await clearNotifications();
  });

  it("um e-mail no texto não dispara menção por engano", async () => {
    // "contato@higor.com" tem "@higor" — mas não deve notificar, porque o
    // nome não termina ali (`\M` exige fim de palavra).
    await comment(adminId, "Escrevi para contato@higorx.com.br ontem.");
    expect(await notificationsOf(higorId)).toHaveLength(0);
    await clearNotifications();
  });
});
