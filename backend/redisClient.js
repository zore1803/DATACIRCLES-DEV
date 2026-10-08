// import { createClient } from "redis";
// import dotenv from "dotenv";
// dotenv.config();

// const redisClient = createClient({
//   url: process.env.REDIS_URL, // e.g. redis://default:YOUR_SECURE_PASSWORD@localhost:6379
// });

// redisClient.on("error", (err) => console.error("Redis Client Error", err));

// (async () => {
//   if (!redisClient.isOpen) await redisClient.connect();
// })();

// export default redisClient;


// models/redisClient.js (CommonJS version)
const { createClient } = require("redis");
require("dotenv").config();

const redisClient = createClient({
  url: process.env.REDIS_URL,
});

redisClient.on("error", (err) => console.error("Redis Client Error", err));
redisClient.on("ready", () => console.log("Redis connected and ready"));

(async () => {
  if (!redisClient.isOpen) await redisClient.connect();
})();

module.exports = redisClient; // Change export default to module.exports