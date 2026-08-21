const { query } = require("./db");

const normalizeEmail = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || null;
};

const configuredAdminEmails = new Set(
  String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean)
);

let defaultTenantIdPromise = null;

const loadDefaultTenant = async () => {
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

const getDefaultTenant = () => {
  if (!defaultTenantIdPromise) {
    defaultTenantIdPromise = loadDefaultTenant().catch((err) => {
      defaultTenantIdPromise = null;
      throw err;
    });
  }
  return defaultTenantIdPromise;
};

const getUserIdentity = (user) => {
  if (!user) return null;
  const email =
    [
      user.preferred_username,
      user.upn,
      user.email,
      user.userDetails,
    ]
      .map(normalizeEmail)
      .find(Boolean) || null;
  // auth.js returns `displayName`; some token paths expose `name` — check both
  const displayName = user.displayName || user.name || email;
  return email ? { email, displayName } : null;
};

const getOrCreateUser = async (tenantId, user) => {
  const identity = getUserIdentity(user);
  if (!identity) return null;
  const isConfiguredAdmin = configuredAdminEmails.has(identity.email);

  const existing = await query(
    `SELECT id, role, is_active, email, display_name
     FROM users
     WHERE tenant_id = $1 AND lower(trim(email)) = $2
     LIMIT 1`,
    [tenantId, identity.email]
  );
  const current = existing.rows[0];
  const isCurrentRowUpToDate =
    current &&
    current.email === identity.email &&
    current.display_name === identity.displayName &&
    (!isConfiguredAdmin || current.role === "admin");
  if (isCurrentRowUpToDate) {
    return { id: current.id, role: current.role, is_active: current.is_active };
  }

  const created = await query(
    `INSERT INTO users (tenant_id, email, display_name, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, (lower(trim(email))))
     DO UPDATE SET
       email = EXCLUDED.email,
       display_name = EXCLUDED.display_name,
       role = CASE
         WHEN EXCLUDED.role = 'admin' THEN 'admin'
         ELSE users.role
       END
     RETURNING id, role, is_active`,
    [
      tenantId,
      identity.email,
      identity.displayName,
      isConfiguredAdmin ? "admin" : "viewer",
    ]
  );
  return created.rows[0];
};

const resolveIdentity = async (user) => {
  const tenantId = await getDefaultTenant();
  const identity = getUserIdentity(user);
  const databaseUser = await getOrCreateUser(tenantId, user);
  return {
    tenantId,
    userId: databaseUser?.is_active === false ? null : databaseUser?.id || null,
    role: databaseUser?.role || null,
    isActive: databaseUser?.is_active !== false,
    email: identity?.email || null,
    displayName: identity?.displayName || null,
  };
};

module.exports = { resolveIdentity };
