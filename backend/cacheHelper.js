// Read-through cache on top of Redis.
//
// Redis problems never block or fail a request — they just mean "no cache": the
// work is done once and returned. Errors from the work itself (fetchFn: a database
// or report failure) are NOT Redis problems, so they propagate unchanged and the
// work is never retried here.
//
// Two things keep a Redis outage from slowing requests down:
//  - node-redis QUEUES commands while disconnected, so a plain `get` would wait for a
//    reconnect that may never come. When the client reports it isn't ready we skip
//    Redis entirely instead of queueing.
//  - Every Redis command also has a short timeout, covering a connection that looks
//    ready but isn't answering (half-open socket, stalled server).
//
// The client is resolved lazily so importing this module (e.g. from a test with a
// fake client) does not open a Redis connection.
const defaultClient = () => require("./redisClient");

const DEFAULT_COMMAND_TIMEOUT_MS = Number(process.env.REDIS_CACHE_TIMEOUT_MS) || 500;

// A result is cacheable unless it is null/undefined (nothing worth remembering, and
// "no result" is indistinguishable from a cache miss on the next read).
const defaultShouldCache = (value) => value !== null && value !== undefined;

// Rejects if `promise` hasn't settled within `ms`. The abandoned promise is given a
// no-op catch so a late rejection can't surface as an unhandled rejection.
function withTimeout(promise, ms) {
  let timer;
  promise.catch(() => {});
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Redis command timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// node-redis exposes `isReady`; a stand-in client without it is assumed usable.
const isUnavailable = (client) => client.isReady === false;

function createCacheGetOrSet(getClient = defaultClient, { commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS } = {}) {
  /**
   * @param {string} key
   * @param {number} ttlSeconds
   * @param {() => Promise<any>} fetchFn  produces the value on a miss; runs at most once
   * @param {{ shouldCache?: (value:any) => boolean }} [options]
   *   shouldCache: return false to hand the value back WITHOUT storing it (e.g. a
   *   degraded result that must not stick around for the whole TTL).
   */
  return async function cacheGetOrSet(key, ttlSeconds, fetchFn, { shouldCache = defaultShouldCache } = {}) {
    // 1. Read. Redis unavailable, slow, failing, or an unreadable cached value all
    //    count as a miss.
    try {
      const client = getClient();
      if (!isUnavailable(client)) {
        const cached = await withTimeout(client.get(key), commandTimeoutMs);
        if (cached) {
          console.log("cache hit!");
          return JSON.parse(cached);
        }
      }
    } catch (error) {
      console.error("Redis read error (continuing without cache):", error.message);
    }

    // 2. Compute — outside any Redis try/catch, so a failure here propagates as-is
    //    and is never run a second time.
    const freshData = await fetchFn();

    // 3. Store, best effort. A failed, slow or skipped write never affects the response.
    if (shouldCache(freshData)) {
      try {
        const client = getClient();
        if (!isUnavailable(client)) {
          await withTimeout(client.setEx(key, ttlSeconds, JSON.stringify(freshData)), commandTimeoutMs);
        }
      } catch (error) {
        console.error("Redis write error (result not cached):", error.message);
      }
    }

    return freshData;
  };
}

exports.createCacheGetOrSet = createCacheGetOrSet;
exports.cacheGetOrSet = createCacheGetOrSet();
