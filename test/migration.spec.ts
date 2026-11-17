import { env, evictDurableObject, runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";

it("upgrades populated v8 data without changing questions, participants, votes, flags or event metadata", async () => {
  const stub = env.LIVE_SESSION.getByName(`migration-${crypto.randomUUID()}`);
  const alarmAt = Date.now() + 3_600_000;
  const original = await runInDurableObject(stub, async (_instance, state) => {
    const sql = state.storage.sql;
    state.storage.transactionSync(() => {
      sql.exec(`
        DROP TABLE question_flags;
        DROP TABLE question_votes;
        DROP TABLE questions;
        DROP TABLE participants;
        CREATE TABLE questions (
          id TEXT PRIMARY KEY, voter_id TEXT NOT NULL, text TEXT NOT NULL,
          nickname TEXT NOT NULL, lens TEXT NOT NULL DEFAULT 'clarify',
          difficulty INTEGER NOT NULL DEFAULT 3, created_at INTEGER NOT NULL,
          visibility TEXT NOT NULL DEFAULT 'public', publish_at INTEGER,
          moderation_reason TEXT, moderated_at INTEGER, moderated_by TEXT
        );
        CREATE TABLE participants (
          voter_id TEXT PRIMARY KEY, alias TEXT NOT NULL, public_label TEXT NOT NULL,
          coc_version TEXT NOT NULL, coc_accepted_at INTEGER NOT NULL,
          question_state TEXT NOT NULL DEFAULT 'normal', slow_until INTEGER,
          created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
          flags_agreed INTEGER NOT NULL DEFAULT 0, flags_rejected INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE question_votes (
          question_id TEXT NOT NULL, voter_id TEXT NOT NULL, created_at INTEGER NOT NULL,
          PRIMARY KEY (question_id, voter_id),
          FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
        );
        CREATE TABLE question_flags (
          question_id TEXT NOT NULL, voter_id TEXT NOT NULL, reason TEXT NOT NULL,
          weight REAL NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL,
          resolved_at INTEGER, PRIMARY KEY (question_id, voter_id),
          FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
          FOREIGN KEY (voter_id) REFERENCES participants(voter_id) ON DELETE CASCADE
        );
        CREATE INDEX idx_questions_created_at ON questions(created_at);
        CREATE INDEX idx_questions_voter_id ON questions(voter_id);
        CREATE INDEX idx_questions_visibility_publish_at ON questions(visibility, publish_at);
        CREATE INDEX idx_question_votes_question_id ON question_votes(question_id);
        CREATE INDEX idx_question_flags_question_status ON question_flags(question_id, status);
        CREATE INDEX idx_question_flags_voter_id ON question_flags(voter_id);
        INSERT INTO participants VALUES
          ('author', 'Camille', 'Camille #1234', 'rules-v1', 101, 'review', 999, 100, 102, 2, 3),
          ('reporter', 'Lou', 'Lou #5678', 'rules-v2', 201, 'muted', NULL, 200, 202, 4, 5);
        INSERT INTO questions VALUES
          ('q-public', 'author', 'Public question', 'Camille #1234', 'clarify', 2, 301, 'public', NULL, NULL, NULL, NULL),
          ('q-pending', 'author', 'Pending question', 'Camille #1234', 'bridge', 4, 302, 'pending', 9999999999999, NULL, NULL, NULL),
          ('q-hidden', 'author', 'Hidden question', 'Earlier name', 'keeper', 5, 303, 'author_only', NULL, 'privacy', 400, 'moderator');
        INSERT INTO question_votes VALUES ('q-public', 'reporter', 500), ('q-hidden', 'reporter', 501);
        INSERT INTO question_flags VALUES ('q-hidden', 'reporter', 'privacy', 1.5, 'pending', 600, NULL);
        INSERT INTO difficulty_votes VALUES ('author', 3, 700);
        INSERT INTO votes VALUES ('poll-1', 'author', 1, 701);
        INSERT INTO moderation_actions VALUES ('action-1', 'q-hidden', 'author', 'hide', 'privacy', 'moderator', 702);
        INSERT INTO event_config VALUES (1, '{"existing":"metadata"}', 703);
        INSERT INTO hosted_event VALUES (1, 'event-id', 'admin-hash', 'moderator-hash', 704, 9999999999999);
        INSERT INTO hosted_deck VALUES (1, 'slides.pdf', 'application/pdf', 4);
        INSERT INTO hosted_deck_chunks VALUES (0, X'25504446');
        DELETE FROM _sql_schema_migrations WHERE id = 9;
      `);
    });
    await state.storage.setAlarm(alarmAt);
    return readRows(sql);
  });
  await evictDurableObject(stub);
  const migrated = await runInDurableObject(stub, async (_instance, state) => {
    const sql = state.storage.sql;
    expect(sql.exec("PRAGMA foreign_key_check").toArray()).toEqual([]);
    expect(await state.storage.getAlarm()).toBe(alarmAt);
    for (const [table, columns] of [["questions", ["lens", "difficulty"]], ["participants", ["coc_version", "coc_accepted_at"]]] as const) {
      const info = sql.exec<{ name: string; notnull: number }>(`PRAGMA table_info(${table})`).toArray();
      for (const column of columns) expect(info.find((entry) => entry.name === column)?.notnull).toBe(0);
    }
    expect(() => state.storage.transactionSync(() => {
      sql.exec("DELETE FROM questions WHERE id = 'q-hidden'");
      expect(sql.exec("SELECT * FROM question_flags WHERE question_id = 'q-hidden'").toArray()).toEqual([]);
      expect(sql.exec("SELECT * FROM question_votes WHERE question_id = 'q-hidden'").toArray()).toEqual([]);
      throw new Error("roll back the cascade check");
    })).toThrow("roll back the cascade check");
    return readRows(sql);
  });
  expect(migrated).toEqual(original);
  await evictDurableObject(stub);
  expect(await runInDurableObject(stub, (_instance, state) => readRows(state.storage.sql))).toEqual(original);
});

function readRows(sql: SqlStorage) {
  const tables = ["questions", "participants", "question_votes", "question_flags", "difficulty_votes", "votes", "moderation_actions", "event_config", "hosted_event", "hosted_deck", "hosted_deck_chunks"];
  return Object.fromEntries(tables.map((table) => {
    const rows = sql.exec(`SELECT * FROM ${table}`).toArray().map((row) => Object.fromEntries(Object.entries(row).sort()));
    return [table, rows];
  }).concat([["indexes", sql.exec("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' ORDER BY name").toArray()]]));
}
