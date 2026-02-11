const { query } = require("./db");

const getDefaultTenant = async () => {
  const result = await query(
    "SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1"
  );
  if (result.rows.length > 0) return result.rows[0].id;

  const name = process.env.DEFAULT_TENANT_NAME || "default";
  const created = await query(
    "INSERT INTO tenants (name) VALUES ($1) RETURNING id",
    [name]
  );
  return created.rows[0].id;
};

const getUserIdentity = (user) => {
  if (!user) return null;
  const email = user.preferred_username || user.upn || user.email;
  const displayName = user.name || email;
  return email ? { email, displayName } : null;
};

const getOrCreateUser = async (tenantId, user) => {
  const identity = getUserIdentity(user);
  if (!identity) return null;

  const existing = await query(
    "SELECT id FROM users WHERE tenant_id = $1 AND email = $2 LIMIT 1",
    [tenantId, identity.email]
  );

  if (existing.rows.length > 0) return existing.rows[0].id;

  const created = await query(
    "INSERT INTO users (tenant_id, email, display_name) VALUES ($1, $2, $3) RETURNING id",
    [tenantId, identity.email, identity.displayName]
  );
  return created.rows[0].id;
};

const resolveIdentity = async (user) => {
  const tenantId = await getDefaultTenant();
  const userId = await getOrCreateUser(tenantId, user);
  return { tenantId, userId };
};

module.exports = { resolveIdentity };
