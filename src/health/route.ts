import nc from "next-connect";
import { client } from "../db/mongo";
import { redis } from "../db/redis";

const appHealth = nc().get("/", (req, res) => {
  const mongoOk = client.isConnected();
  const redisStatus = redis.status;

  if (!mongoOk || redisStatus !== "ready") res.statusCode = 500;
  // Health check
  res.end(`mongodb: ${mongoOk}
redis: ${redisStatus}`);
});

export default appHealth;
