import type { Database } from "bun:sqlite";
import type { User, UserProfile } from "@grugchug/shared";

// Storage behind the users route. One implementation: SQLite, in a file for
// the app and in memory for tests, which exercise the same SQL.
export type UserRepo = {
  get(id: string): Promise<User | null>;
  upsert(id: string, profile: UserProfile): Promise<User>;
};

type UserRow = { id: string; name: string; avatar: User["avatar"]; created_at: string };

function toUser(row: UserRow): User {
  return { id: row.id, name: row.name, avatar: row.avatar, createdAt: row.created_at };
}

// `now` is injectable so tests can pin created_at.
export function sqliteUserRepo(
  db: Database,
  now: () => string = () => new Date().toISOString(),
): UserRepo {
  const select = db.query<UserRow, [string]>(
    "SELECT id, name, avatar, created_at FROM users WHERE id = ?",
  );
  // created_at is written once: the conflict branch leaves it alone.
  const upsert = db.query<UserRow, [string, string, string, string]>(
    `INSERT INTO users (id, name, avatar, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar
     RETURNING id, name, avatar, created_at`,
  );
  return {
    async get(id) {
      const row = select.get(id);
      return row ? toUser(row) : null;
    },
    async upsert(id, profile) {
      const row = upsert.get(id, profile.name, profile.avatar, now());
      if (!row) throw new Error(`upsert of user ${id} returned no row`);
      return toUser(row);
    },
  };
}
