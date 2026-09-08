import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { canonicalSchema, type Canonical } from "../schema/character";
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  canonical: text("canonical").notNull(),
  version: integer("version").notNull(),
  archived: integer("archived").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const revisions = sqliteTable("revisions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  canonical: text("canonical").notNull(),
  source: text("source").notNull(),
  createdAt: text("created_at").notNull(),
});
export const characters = sqliteTable("characters", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  data: text("data").notNull(),
});
export const worlds = sqliteTable("worlds", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  data: text("data").notNull(),
});
export const lorebooks = sqliteTable("lorebooks", {
  projectId: text("project_id").primaryKey(),
  data: text("data").notNull(),
});
export const lorebookEntries = sqliteTable("lorebook_entries", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  data: text("data").notNull(),
});
let instance: Database.Database;
export function db() {
  if (instance) return instance;
  const file = (process.env.DATABASE_URL ?? "file:./data/app.db").replace(
    /^file:/,
    "",
  );
  mkdirSync(path.dirname(file), { recursive: true });
  instance = new Database(file);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  instance.pragma("busy_timeout = 5000");
  instance.exec(`CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,canonical TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,archived INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS revisions(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,canonical TEXT NOT NULL,source TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS providers(id TEXT PRIMARY KEY,config TEXT NOT NULL,credential TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,name TEXT NOT NULL,mime TEXT NOT NULL,data BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS agent_runs(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,agent TEXT NOT NULL,model TEXT NOT NULL,result TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS revisions_project ON revisions(project_id,created_at);
CREATE TABLE IF NOT EXISTS characters(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS worlds(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS lorebooks(project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS lorebook_entries(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS model_preferences(provider_id TEXT PRIMARY KEY REFERENCES providers(id) ON DELETE CASCADE,default_model TEXT NOT NULL,favorites TEXT NOT NULL,recent TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS agent_suggestions(id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,operation_index INTEGER NOT NULL,operation TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending');
CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);
`);
  if (
    !instance.prepare("SELECT 1 FROM schema_migrations WHERE version=1").get()
  ) {
    instance.transaction(() => {
      for (const row of instance
        .prepare("SELECT id,canonical FROM projects")
        .all() as { id: string; canonical: string }[])
        syncProjection(
          row.id,
          canonicalSchema.parse(JSON.parse(row.canonical)),
        );
      instance
        .prepare("INSERT INTO schema_migrations VALUES(1,?)")
        .run(new Date().toISOString());
    })();
  }
  return instance;
}
export const orm = () =>
  drizzle(db(), {
    schema: {
      projects,
      revisions,
      characters,
      worlds,
      lorebooks,
      lorebookEntries,
    },
  });
// These queryable projections are rebuilt atomically; Canonical remains authoritative.
function syncProjection(id: string, c: Canonical) {
  const sql = db();
  sql
    .prepare(
      "INSERT INTO characters VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
    )
    .run(id + ":main", id, JSON.stringify(c.character));
  sql.prepare("DELETE FROM worlds WHERE project_id=?").run(id);
  c.worlds.forEach((world, i) =>
    sql
      .prepare("INSERT INTO worlds VALUES(?,?,?)")
      .run(id + ":" + i, id, JSON.stringify(world)),
  );
  sql
    .prepare(
      "INSERT INTO lorebooks VALUES(?,?) ON CONFLICT(project_id) DO UPDATE SET data=excluded.data",
    )
    .run(id, JSON.stringify({ ...c.lorebook, entries: [] }));
  sql.prepare("DELETE FROM lorebook_entries WHERE project_id=?").run(id);
  c.lorebook.entries.forEach((entry, i) =>
    sql
      .prepare("INSERT INTO lorebook_entries VALUES(?,?,?)")
      .run(id + ":" + i, id, JSON.stringify(entry)),
  );
}
export function saveModelPreference(config: {
  id: string;
  defaultModel: string;
  favorites: string[];
  recent: string[];
}) {
  db()
    .prepare(
      "INSERT INTO model_preferences VALUES(?,?,?,?) ON CONFLICT(provider_id) DO UPDATE SET default_model=excluded.default_model,favorites=excluded.favorites,recent=excluded.recent",
    )
    .run(
      config.id,
      config.defaultModel,
      JSON.stringify(config.favorites),
      JSON.stringify(config.recent),
    );
}
export type Project = {
  id: string;
  name: string;
  canonical: Canonical;
  version: number;
  archived: number;
  updated_at: string;
};
export function getProject(id: string): Project {
  const row = db().prepare("SELECT * FROM projects WHERE id=?").get(id) as
    (Omit<Project, "canonical"> & { canonical: string }) | undefined;
  if (!row) throw new Error("项目不存在");
  return {
    ...row,
    canonical: canonicalSchema.parse(JSON.parse(row.canonical)),
  };
}
export function revision(id: string, c: Canonical, source: string) {
  db()
    .prepare("INSERT INTO revisions VALUES(?,?,?,?,?)")
    .run(
      crypto.randomUUID(),
      id,
      JSON.stringify(c),
      source,
      new Date().toISOString(),
    );
}
export function createProject(name: string, c: Canonical) {
  const id = crypto.randomUUID();
  db().transaction(() => {
    db()
      .prepare("INSERT INTO projects VALUES(?,?,?,1,0,?)")
      .run(id, name, JSON.stringify(c), new Date().toISOString());
    revision(id, c, "Create");
    syncProjection(id, c);
  })();
  return getProject(id);
}
export function saveProject(
  id: string,
  c: Canonical,
  version: number,
  source = "Manual edit",
) {
  canonicalSchema.parse(c);
  return db().transaction(() => {
    const old = getProject(id);
    if (old.version !== version)
      throw new Error("版本冲突：请重新加载项目，当前编辑已保留");
    db()
      .prepare(
        "UPDATE projects SET canonical=?,version=version+1,updated_at=? WHERE id=?",
      )
      .run(JSON.stringify(c), new Date().toISOString(), id);
    revision(id, c, source);
    syncProjection(id, c);
    return getProject(id);
  })();
}
