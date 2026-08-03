const { query } = require("./db");

const configuredAdminEmails = new Set(
  String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

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
  const email = user.preferred_username || user.upn || user.email || user.userDetails;
  // auth.js returns `displayName`; some token paths expose `name` — check both
  const displayName = user.displayName || user.name || email;
  return email ? { email, displayName } : null;
};

const getOrCreateUser = async (tenantId, user) => {
  const identity = getUserIdentity(user);
  if (!identity) return null;
  const isConfiguredAdmin = configuredAdminEmails.has(identity.email.toLowerCase());

  const existing = await query(
    "SELECT id, role FROM users WHERE tenant_id = $1 AND email = $2 LIMIT 1",
    [tenantId, identity.email]
  );

  if (existing.rows.length > 0) {
    const existingUser = existing.rows[0];
    const updates = [];
    const params = [];

    if (identity.displayName) {
      params.push(identity.displayName);
      updates.push(`display_name = $${params.length}`);
    }
    if (isConfiguredAdmin && existingUser.role !== "admin") {
      params.push("admin");
      updates.push(`role = $${params.length}`);
    }

    if (updates.length > 0) {
      params.push(existingUser.id);
      await query(
        `UPDATE users SET ${updates.join(", ")} WHERE id = $${params.length}`,
        params
      );
    }

    return {
      id: existingUser.id,
      role: isConfiguredAdmin ? "admin" : existingUser.role,
    };
  }

  const created = await query(
    "INSERT INTO users (tenant_id, email, display_name, role) VALUES ($1, $2, $3, $4) RETURNING id, role",
    [tenantId, identity.email, identity.displayName, isConfiguredAdmin ? "admin" : "viewer"]
  );
  return created.rows[0];
};

const resolveIdentity = async (user) => {
  const tenantId = await getDefaultTenant();
  const identity = getUserIdentity(user);
  const databaseUser = await getOrCreateUser(tenantId, user);
  return {
    tenantId,
    userId: databaseUser?.id || null,
    role: databaseUser?.role || null,
    email: identity?.email || null,
    displayName: identity?.displayName || null,
  };
};

module.exports = { resolveIdentity };
