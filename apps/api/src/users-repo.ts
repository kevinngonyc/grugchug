import type { User, UserProfile } from "@grugchug/shared";
import type { Db } from "mongodb";

// Storage behind the users route. The Mongo version is the real one; the
// memory version keeps route tests offline.
export type UserRepo = {
  get(id: string): Promise<User | null>;
  upsert(id: string, profile: UserProfile): Promise<User>;
};

// Stored with the browser's id as _id. createdAt is set once, on insert.
type UserDoc = { _id: string; name: string; avatar: User["avatar"]; createdAt: string };

function toUser(doc: UserDoc): User {
  return { id: doc._id, name: doc.name, avatar: doc.avatar, createdAt: doc.createdAt };
}

export function mongoUserRepo(getDb: () => Promise<Db>): UserRepo {
  const users = async () => (await getDb()).collection<UserDoc>("users");
  return {
    async get(id) {
      const doc = await (await users()).findOne({ _id: id });
      return doc ? toUser(doc) : null;
    },
    async upsert(id, profile) {
      const doc = await (await users()).findOneAndUpdate(
        { _id: id },
        {
          $set: { name: profile.name, avatar: profile.avatar },
          $setOnInsert: { createdAt: new Date().toISOString() },
        },
        { upsert: true, returnDocument: "after" },
      );
      if (!doc) throw new Error(`upsert of user ${id} returned no document`);
      return toUser(doc);
    },
  };
}

export function memoryUserRepo(now: () => string = () => new Date().toISOString()): UserRepo {
  const docs = new Map<string, User>();
  return {
    async get(id) {
      return docs.get(id) ?? null;
    },
    async upsert(id, profile) {
      const createdAt = docs.get(id)?.createdAt ?? now();
      const user: User = { id, name: profile.name, avatar: profile.avatar, createdAt };
      docs.set(id, user);
      return user;
    },
  };
}
