// Read-through cache on top of Redis.
//
// Redis problems never block or fail a request — they just mean "no cache": the
// work is done once and returned. Errors from the work itself (fetchFn: a database
// or report failure) are NOT Redis problems, so they propagate unchanged and the
// work is never retried here.
//
// The client is resolved lazily so importing this module (e.g. from a test with a
// fake client) does not open a Redis connection.
const defaultClient = () => require("./redisClient");

// A result is cacheable unless it is null/undefined (nothing worth remembering, and
// "no result" is indistinguishable from a cache miss on the next read).
const defaultShouldCache = (value) => value !== null && value !== undefined;

function createCacheGetOrSet(getClient = defaultClient) {
  /**
   * @param {string} key
   * @param {number} ttlSeconds
   * @param {() => Promise<any>} fetchFn  produces the value on a miss; runs at most once
   * @param {{ shouldCache?: (value:any) => boolean }} [options]
   *   shouldCache: return false to hand the value back WITHOUT storing it (e.g. a
   *   degraded result that must not stick around for the whole TTL).
   */
  return async function cacheGetOrSet(key, ttlSeconds, fetchFn, { shouldCache = defaultShouldCache } = {}) {
    // 1. Read. Any Redis failure (or an unreadable cached value) is treated as a miss.
    try {
      const cached = await getClient().get(key);
      if (cached) {
        console.log("cache hit!");
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error("Redis read error (continuing without cache):", error);
    }

    // 2. Compute — outside any Redis try/catch, so a failure here propagates as-is
    //    and is never run a second time.
    const freshData = await fetchFn();

    // 3. Store, best effort. A failed or skipped write never affects the response.
    if (shouldCache(freshData)) {
      try {
        await getClient().setEx(key, ttlSeconds, JSON.stringify(freshData));
      } catch (error) {
        console.error("Redis write error (result not cached):", error);
      }
    }

    return freshData;
  };
}

exports.createCacheGetOrSet = createCacheGetOrSet;
exports.cacheGetOrSet = createCacheGetOrSet();
