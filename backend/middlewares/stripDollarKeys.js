// middlewares/stripDollarKeys.js
//
// Removes `$`-prefixed keys ($ne, $gt, $set, $where, ...) from req.body so a
// client-supplied JSON payload can never reach Mongoose as a MongoDB operator
// (e.g. {"email": {"$ne": null}}). Must run AFTER express.json().
//
// Deliberately narrow:
//  - only req.body: req.query is already flat under Express 5's default
//    "simple" query parser, and req.params are plain strings;
//  - only the `$` prefix: dotted keys are left alone, custom-field payloads
//    may legitimately contain them;
//  - only plain objects and arrays are walked (Buffers and class instances are
//    left as they are);
//  - every removal is logged with the route and key path, so nothing changes
//    silently.
const MAX_DEPTH = 50;

const isPlainObject = (v) => {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

// Mutates `node` in place; returns false if it nests deeper than MAX_DEPTH.
function strip(node, path, removed, depth) {
  if (depth > MAX_DEPTH) return false;

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (!strip(node[i], `${path}[${i}]`, removed, depth + 1)) return false;
    }
    return true;
  }

  if (isPlainObject(node)) {
    for (const key of Object.keys(node)) {
      if (key.startsWith("$")) {
        removed.push(path ? `${path}.${key}` : key);
        delete node[key];
      } else if (!strip(node[key], path ? `${path}.${key}` : key, removed, depth + 1)) {
        return false;
      }
    }
  }
  return true;
}

module.exports = function stripDollarKeys(req, res, next) {
  if (!req.body || typeof req.body !== "object" || Buffer.isBuffer(req.body)) {
    return next();
  }

  const removed = [];
  if (!strip(req.body, "", removed, 0)) {
    return res.status(400).json({ message: "Request body is nested too deeply" });
  }

  if (removed.length) {
    console.warn(
      `[security] stripped $-prefixed key(s) from ${req.method} ${req.originalUrl}: ${removed.join(", ")}`,
    );
  }
  next();
};
