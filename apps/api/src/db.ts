import { type Db, MongoClient } from "mongodb";

let connecting: Promise<MongoClient> | undefined;

// Connects on first use so tests and the health route never touch MongoDB.
// The in-flight promise is what gets memoized, not the client: opening a chat
// room fires several requests at once, and caching only the settled client
// would let each of them start its own connection.
export async function getDb(): Promise<Db> {
  if (!connecting) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set");
    connecting = MongoClient.connect(uri).catch((cause: unknown) => {
      // A failed attempt must not be cached, or every later request inherits
      // the same rejection even after MongoDB comes up.
      connecting = undefined;
      throw cause;
    });
  }
  return (await connecting).db();
}
