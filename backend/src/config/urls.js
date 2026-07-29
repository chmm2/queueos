/**
 * Some hosting platforms (e.g. Render `fromService`) inject another service's
 * bare hostname — "queueos-api.onrender.com" — with no scheme. This makes such
 * values usable everywhere by prepending https:// when a scheme is missing.
 * Full URLs and the wildcard "*" are left untouched.
 */
function withScheme(value) {
  if (!value || value === '*') return value;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

module.exports = { withScheme };
