/**
 * Fail-fast configuration validation. Run at startup so the process refuses
 * to boot in an unsafe state instead of failing mysteriously later (e.g. a
 * blank JWT secret that would let anyone forge a token).
 */
const WEAK_SECRETS = new Set([
  'change-me-in-production',
  'replace-with-a-long-random-secret',
  'secret',
  'changeme',
]);

function validateEnv() {
  const errors = [];
  const warnings = [];
  const isProd = process.env.NODE_ENV === 'production';

  const secret = process.env.JWT_SECRET || '';
  if (!secret || secret.length < 16) {
    errors.push('JWT_SECRET must be set and at least 16 characters long.');
  } else if (WEAK_SECRETS.has(secret)) {
    // A known placeholder: hard-fail in production, warn in dev.
    if (isProd) errors.push('JWT_SECRET is a known default/placeholder — set a strong unique secret in production.');
    else warnings.push('JWT_SECRET looks like a development placeholder. Do not use this value in production.');
  }

  if (!process.env.MONGO_URI && isProd) {
    warnings.push('MONGO_URI not set — falling back to mongodb://localhost:27017/queue-platform.');
  }

  if ((!process.env.CLIENT_URL || process.env.CLIENT_URL === '*') && isProd) {
    warnings.push('CLIENT_URL is "*" (open CORS). Set it to your frontend origin in production.');
  }

  warnings.forEach((w) => console.warn(`[config] WARNING: ${w}`));

  if (errors.length) {
    console.error('\n[config] Refusing to start — fix these first:');
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }
}

module.exports = { validateEnv };
