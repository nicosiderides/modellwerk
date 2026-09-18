import { isTauri, invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import Database from "@tauri-apps/plugin-sql";
import { parseProject, serializeProject } from "../../core/building/persistence";
import type { Project } from "../../core/building/types";

export type StoredProject = {
  id: string;
  name: string;
  updatedAt: number;
};

type StoredProjectRow = {
  id: string;
  name: string;
  updated_at: number | string;
};

let database: Promise<Database> | undefined;

export function isDesktopApp() {
  return isTauri();
}

async function db() {
  if (!database) {
    database = Database.load("sqlite:modellwerk.db").then(async (connection) => {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        )
      `);
      return connection;
    });
  }
  return database;
}

export async function listStoredProjects(): Promise<StoredProject[]> {
  const rows = await (await db()).select<StoredProjectRow[]>(
    "SELECT id, name, updated_at FROM projects ORDER BY updated_at DESC",
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    updatedAt: Number(row.updated_at),
  }));
}

export async function loadStoredProject(id: string): Promise<Project> {
  const rows = await (await db()).select<{ payload: string }[]>(
    "SELECT payload FROM projects WHERE id = $1 LIMIT 1",
    [id],
  );
  if (!rows[0]) throw new Error("El proyecto local ya no existe.");
  return parseProject(rows[0].payload);
}

export async function saveStoredProject(id: string, project: Project) {
  const connection = await db();
  const now = Date.now();
  await connection.execute(
    `INSERT INTO projects (id, name, payload, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $4)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       payload = excluded.payload,
       updated_at = excluded.updated_at`,
    [id, project.name || "Proyecto sin nombre", serializeProject(project), now],
  );
  await connection.execute(
    `INSERT INTO settings (key, value) VALUES ('active_project_id', $1)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [id],
  );
}

export async function lastStoredProjectId() {
  const rows = await (await db()).select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = 'active_project_id' LIMIT 1",
  );
  return rows[0]?.value;
}

function safeFileName(name: string) {
  return (name.trim() || "MW900-proyecto")
    .replace(/[<>:\"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .slice(0, 80);
}

export async function exportProjectDocument(project: Project) {
  const path = await save({
    title: "Guardar proyecto MODELLWERK",
    defaultPath: `${safeFileName(project.name)}.mwproject`,
    filters: [{ name: "Proyecto MODELLWERK", extensions: ["mwproject"] }],
  });
  if (!path) return false;
  await invoke("write_project_file", { path, contents: serializeProject(project) });
  return true;
}

export async function importProjectDocument() {
  const path = await open({
    title: "Abrir proyecto MODELLWERK",
    multiple: false,
    directory: false,
    filters: [{ name: "Proyecto MODELLWERK", extensions: ["mwproject", "json"] }],
  });
  if (!path) return null;
  const contents = await invoke<string>("read_project_file", { path });
  return parseProject(contents);
}
