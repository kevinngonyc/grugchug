import { type Db, MongoClient } from "mongodb";

let client: MongoClient | undefined;

// Connects on first use so tests and the health route never touch MongoDB.
export async function getDb(): Promise<Db> {
  if (!client) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set");
    client = await MongoClient.connect(uri);
  }
  return client.db();
}
