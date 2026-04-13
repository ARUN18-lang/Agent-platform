import { MongoClient } from "mongodb";

let client = null;
let db = null;

const DEFAULT_DB = "agent_platform";

export async function connectMongo() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    console.warn("[mongo] MONGODB_URI is not set — session storage is disabled.");
    return null;
  }

  client = new MongoClient(uri);
  await client.connect();
  const name = process.env.MONGODB_DB?.trim() || DEFAULT_DB;
  db = client.db(name);
  await db.collection("sessions").createIndex({ updatedAt: -1 });
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("voice_inputs").createIndex({ userId: 1, streamId: 1, segmentIndex: 1 });
  await db.collection("voice_inputs").createIndex({ userId: 1, createdAt: -1 });
  console.log(`[mongo] Connected (${name})`);
  return db;
}

export function getDb() {
  return db;
}

export async function closeMongo() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
