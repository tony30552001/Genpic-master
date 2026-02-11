const counters = new Map();

const getKey = (req, user) => {
  if (user?.oid) return `user:${user.oid}`;
  if (user?.sub) return `user:${user.sub}`;
  const ip =
    req.headers?.["x-forwarded-for"] ||
    req.headers?.["x-client-ip"] ||
    req.headers?.["x-real-ip"] ||
    "unknown";
  return `ip:${ip}`;
};

const rateLimit = (req, user) => {
  const limit = Number(process.env.RATE_LIMIT_PER_MINUTE || 60);
  const now = Date.now();
  const key = getKey(req, user);
  const entry = counters.get(key) || { count: 0, resetAt: now + 60_000 };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + 60_000;
  }

  entry.count += 1;
  counters.set(key, entry);

  if (entry.count > limit) {
    return {
      limited: true,
      retryAfterMs: entry.resetAt - now,
    };
  }

  return { limited: false };
};

module.exports = { rateLimit };
