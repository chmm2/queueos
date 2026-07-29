#!/usr/bin/env bash
#
# End-to-end API check used by CI. Exercises the platform the way real users do:
# an admin logs in, a customer joins from a QR scan with no account, staff call
# them, and tenant isolation is verified against a second organization.
#
# Any failure aborts (set -e) and fails the pipeline.
set -euo pipefail

API="${API:-http://localhost:5000/api}"

# Linux/CI ships `python3`; Windows ships `python` (and a broken `python3` stub),
# so pick the first interpreter that actually runs.
PY=""
for candidate in python3 python; do
  if "$candidate" -c "import sys" >/dev/null 2>&1; then PY="$candidate"; break; fi
done
if [ -z "$PY" ]; then echo "no working Python interpreter found" >&2; exit 1; fi

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
json() { "$PY" -c "import sys,json;print(json.load(sys.stdin)$1)"; }

say "1. Admin login returns tokens + the org's industry vocabulary"
LOGIN=$(curl -fsS -X POST "$API/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@queue.com","password":"password123"}')
TOKEN=$(echo "$LOGIN" | json "['accessToken']")
ORG=$(echo "$LOGIN" | json "['organization']['name']")
COUNTER_WORD=$(echo "$LOGIN" | json "['organization']['terminology']['counter']")
echo "   org='$ORG' counter word='$COUNTER_WORD'"
test -n "$TOKEN"
# The seeded demo is a hospital, so a "counter" must be called a "Room".
test "$COUNTER_WORD" = "Room"

AUTH=(-H "Authorization: Bearer $TOKEN")

say "2. Branch and service config are readable"
BRANCH=$(curl -fsS "$API/branches" "${AUTH[@]}" | json "['branches'][0]['_id']")
SERVICE=$(curl -fsS "$API/services/branch/$BRANCH" "${AUTH[@]}" | json "['services'][0]['_id']")
echo "   branch=$BRANCH service=$SERVICE"

say "3. Public join page config (no auth) exposes services"
curl -fsS "$API/public/branch/$BRANCH/config" | json "['services'][0]['name']"

say "4. A customer joins with no account (the QR flow)"
JOIN=$(curl -fsS -X POST "$API/public/join" \
  -H 'Content-Type: application/json' \
  -d "{\"branchId\":\"$BRANCH\",\"serviceId\":\"$SERVICE\",\"customerName\":\"CI Tester\",\"customerPhone\":\"+15550009999\"}")
TOKEN_ID=$(echo "$JOIN" | json "['tokenId']")
SESSION=$(echo "$JOIN" | json "['sessionToken']")
echo "   issued $(echo "$JOIN" | json "['tokenNumber']") at position $(echo "$JOIN" | json "['position']")"

say "5. The customer can track only their own token (session-bound)"
curl -fsS "$API/public/token/$TOKEN_ID" -H "x-session: $SESSION" | json "['token']['status']"
# Without the session it must be refused.
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API/public/token/$TOKEN_ID")
echo "   no-session request -> HTTP $CODE (expect 403)"
test "$CODE" = "403"

say "6. Duplicate detection blocks a second active token for the same phone"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/public/join" \
  -H 'Content-Type: application/json' \
  -d "{\"branchId\":\"$BRANCH\",\"serviceId\":\"$SERVICE\",\"customerPhone\":\"+15550009999\"}")
echo "   duplicate join -> HTTP $CODE (expect 409)"
test "$CODE" = "409"

say "7. Staff call the next customer (race-safe) and complete them"
STAFF=$(curl -fsS -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"staff@queue.com","password":"password123"}' | json "['accessToken']")
SAUTH=(-H "Authorization: Bearer $STAFF")
COUNTER=$(curl -fsS "$API/counters/branch/$BRANCH" "${SAUTH[@]}" \
  | "$PY" -c "import sys,json;cs=json.load(sys.stdin)['counters'];o=[c for c in cs if c['status']=='open'];print((o or cs)[0]['_id'])")
CALLED=$(curl -fsS -X POST "$API/tokens/call-next" "${SAUTH[@]}" \
  -H 'Content-Type: application/json' -d "{\"counterId\":\"$COUNTER\"}")
CALLED_ID=$(echo "$CALLED" | json "['token']['_id']")
echo "   now serving $(echo "$CALLED" | json "['token']['tokenNumber']")"
curl -fsS -X PATCH "$API/tokens/$CALLED_ID/complete" "${SAUTH[@]}" \
  -H 'Content-Type: application/json' -d '{}' | json "['token']['status']"

say "8. An illegal state transition is rejected with 409"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/tokens/$CALLED_ID/complete" \
  "${SAUTH[@]}" -H 'Content-Type: application/json' -d '{}')
echo "   completing an already-completed token -> HTTP $CODE (expect 409)"
test "$CODE" = "409"

say "9. TENANT ISOLATION: a second org cannot see the first org's data"
# Unique email so the script is safe to re-run against a persistent database.
RIVAL="rival-$(date +%s)-$RANDOM@ci-test.com"
OTHER=$(curl -fsS -X POST "$API/auth/register-org" -H 'Content-Type: application/json' \
  -d "{\"orgName\":\"CI Rival Bank\",\"industry\":\"bank\",\"name\":\"Rival Admin\",\"email\":\"$RIVAL\",\"password\":\"password123\"}" \
  | json "['accessToken']")
LEAKED=$(curl -fsS "$API/tokens/branch/$BRANCH" -H "Authorization: Bearer $OTHER" \
  | "$PY" -c "import sys,json;print(len(json.load(sys.stdin).get('tokens',[])))")
echo "   tokens from org A visible to org B: $LEAKED (expect 0)"
test "$LEAKED" = "0"
# And it cannot attach config to another org's branch.
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/services" \
  -H "Authorization: Bearer $OTHER" -H 'Content-Type: application/json' \
  -d "{\"branch\":\"$BRANCH\",\"name\":\"Injected\",\"tokenPrefix\":\"X\"}")
echo "   cross-tenant service create -> HTTP $CODE (expect 404)"
test "$CODE" = "404"

say "10. The ETA model reports its self-learning state"
curl -fsS "$API/analytics/model" "${AUTH[@]}" | json "['status']"

printf '\n\033[32mAll end-to-end checks passed.\033[0m\n'
