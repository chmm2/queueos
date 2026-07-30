#!/usr/bin/env bash
#
# End-to-end API check used by CI. Exercises the platform the way real users do:
# an admin reads the branch's configuration, a customer joins from a room's QR
# with no account, staff call them from a uniquely-coded counter, and tenant
# isolation is verified against a second organization.
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
len()  { "$PY" -c "import sys,json;print(len(json.load(sys.stdin)$1))"; }

say "1. Admin login returns tokens + the org's customer vocabulary"
LOGIN=$(curl -fsS -X POST "$API/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@queue.com","password":"password123"}')
TOKEN=$(echo "$LOGIN" | json "['accessToken']")
ORG=$(echo "$LOGIN" | json "['organization']['name']")
CUSTOMER_WORD=$(echo "$LOGIN" | json "['organization']['terminology']['customer']")
echo "   org='$ORG'  customers are called '$CUSTOMER_WORD'"
test -n "$TOKEN"
# The seeded demo is a hospital, so customers must be Patients.
test "$CUSTOMER_WORD" = "Patient"

AUTH=(-H "Authorization: Bearer $TOKEN")

say "2. The branch exposes its departments and rooms"
BRANCH=$(curl -fsS "$API/branches" "${AUTH[@]}" | json "['branches'][0]['_id']")
ROOMS_JSON=$(curl -fsS "$API/rooms/branch/$BRANCH" "${AUTH[@]}")

# Work with the room that actually has an OPEN counter, mirroring real usage:
# a customer joins the queue for a room that is currently staffed.
ROOM=$(echo "$ROOMS_JSON" | "$PY" -c "
import sys,json
rooms=json.load(sys.stdin)['rooms']
for r in rooms:
    if any(c['status']=='open' for c in r.get('counters',[])): print(r['_id']); break
else: print(rooms[0]['_id'])")
ROOM_NAME=$(echo "$ROOMS_JSON" | "$PY" -c "
import sys,json
rooms=json.load(sys.stdin)['rooms']
print(next((r['name'] for r in rooms if r['_id']=='$ROOM'), rooms[0]['name']))")
# A department served in THAT room.
DEPT=$(echo "$ROOMS_JSON" | "$PY" -c "
import sys,json
rooms=json.load(sys.stdin)['rooms']
r=next(r for r in rooms if r['_id']=='$ROOM')
print(r['departments'][0]['_id'])")
echo "   branch=$BRANCH  staffed room='$ROOM_NAME'"

say "3. A ROOM's join page offers only that room's departments"
ROOM_DEPTS=$(curl -fsS "$API/public/branch/$BRANCH/config?room=$ROOM" | len "['departments']")
ALL_DEPTS=$(curl -fsS "$API/public/branch/$BRANCH/config" | len "['departments']")
echo "   room offers $ROOM_DEPTS department(s); whole branch offers $ALL_DEPTS"
test "$ROOM_DEPTS" -lt "$ALL_DEPTS"   # a room is a strict subset of the branch

say "4. A ROOM's display shows only that room's queues"
BOARD_DEPTS=$(curl -fsS "$API/public/board/$BRANCH?room=$ROOM" | len "['departments']")
BOARD_AREA=$(curl -fsS "$API/public/board/$BRANCH?room=$ROOM" | json "['area']")
echo "   board area='$BOARD_AREA' showing $BOARD_DEPTS department(s)"
test "$BOARD_AREA" = "$ROOM_NAME"
test "$BOARD_DEPTS" = "$ROOM_DEPTS"

say "5. A customer joins from the room QR (no account)"
JOIN=$(curl -fsS -X POST "$API/public/join" \
  -H 'Content-Type: application/json' \
  -d "{\"branchId\":\"$BRANCH\",\"departmentId\":\"$DEPT\",\"roomId\":\"$ROOM\",\"customerName\":\"CI Tester\",\"customerPhone\":\"+15550009999\"}")
TOKEN_ID=$(echo "$JOIN" | json "['tokenId']")
SESSION=$(echo "$JOIN" | json "['sessionToken']")
echo "   issued $(echo "$JOIN" | json "['tokenNumber']") for $(echo "$JOIN" | json "['departmentName']") at position $(echo "$JOIN" | json "['position']")"

say "6. The customer can track only their own token (session-bound)"
curl -fsS "$API/public/token/$TOKEN_ID" -H "x-session: $SESSION" | json "['token']['status']"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API/public/token/$TOKEN_ID")
echo "   no-session request -> HTTP $CODE (expect 403)"
test "$CODE" = "403"

say "7. Duplicate detection blocks a second active token for the same phone"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/public/join" \
  -H 'Content-Type: application/json' \
  -d "{\"branchId\":\"$BRANCH\",\"departmentId\":\"$DEPT\",\"customerPhone\":\"+15550009999\"}")
echo "   duplicate join -> HTTP $CODE (expect 409)"
test "$CODE" = "409"

say "8. Staff call the next customer from a uniquely-coded counter"
STAFF=$(curl -fsS -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"staff@queue.com","password":"password123"}' | json "['accessToken']")
SAUTH=(-H "Authorization: Bearer $STAFF")
COUNTERS=$(curl -fsS "$API/counters/branch/$BRANCH" "${SAUTH[@]}")
COUNTER=$(echo "$COUNTERS" | "$PY" -c "import sys,json;cs=json.load(sys.stdin)['counters'];o=[c for c in cs if c['status']=='open'];print((o or cs)[0]['_id'])")
COUNTER_CODE=$(echo "$COUNTERS" | "$PY" -c "import sys,json;cs=json.load(sys.stdin)['counters'];o=[c for c in cs if c['status']=='open'];print((o or cs)[0]['code'])")
echo "   serving from counter $COUNTER_CODE"
# Every counter in the organization must carry a unique printable code.
DUPES=$(echo "$COUNTERS" | "$PY" -c "import sys,json;c=[x['code'] for x in json.load(sys.stdin)['counters']];print(len(c)-len(set(c)))")
echo "   duplicate counter codes: $DUPES (expect 0)"
test "$DUPES" = "0"

CALLED=$(curl -fsS -X POST "$API/tokens/call-next" "${SAUTH[@]}" \
  -H 'Content-Type: application/json' -d "{\"counterId\":\"$COUNTER\"}")
CALLED_ID=$(echo "$CALLED" | json "['token']['_id']")
echo "   now serving $(echo "$CALLED" | json "['token']['tokenNumber']")"
curl -fsS -X PATCH "$API/tokens/$CALLED_ID/complete" "${SAUTH[@]}" \
  -H 'Content-Type: application/json' -d '{}' | json "['token']['status']"

say "9. An illegal state transition is rejected with 409"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/tokens/$CALLED_ID/complete" \
  "${SAUTH[@]}" -H 'Content-Type: application/json' -d '{}')
echo "   completing an already-completed token -> HTTP $CODE (expect 409)"
test "$CODE" = "409"

say "10. SEPARATION OF CONCERNS: a counter never serves another room's queue"
# Issue a token for a department this counter's room does NOT handle.
OTHER_DEPT=$(echo "$ROOMS_JSON" | "$PY" -c "
import sys,json
rooms=json.load(sys.stdin)['rooms']
mine={d['_id'] for r in rooms if r['_id']=='$ROOM' for d in r['departments']}
print(next(d['_id'] for r in rooms if r['_id']!='$ROOM' for d in r['departments'] if d['_id'] not in mine))")
OTHER_ROOM=$(echo "$ROOMS_JSON" | "$PY" -c "
import sys,json
rooms=json.load(sys.stdin)['rooms']
print(next(r['_id'] for r in rooms if r['_id']!='$ROOM' and any(d['_id']=='$OTHER_DEPT' for d in r['departments'])))")
curl -fsS -X POST "$API/public/join" -H 'Content-Type: application/json' \
  -d "{\"branchId\":\"$BRANCH\",\"departmentId\":\"$OTHER_DEPT\",\"roomId\":\"$OTHER_ROOM\",\"customerName\":\"Other Room\"}" > /dev/null
# The staffed counter must find nothing, because that token belongs elsewhere.
OUT=$(curl -fsS -X POST "$API/tokens/call-next" "${SAUTH[@]}" \
  -H 'Content-Type: application/json' -d "{\"counterId\":\"$COUNTER\"}" | json "['token']")
echo "   counter $COUNTER_CODE calling with only another room's token queued -> $OUT (expect None)"
test "$OUT" = "None"

say "11. Departments can be copied to a new branch"
NEW_BRANCH=$(curl -fsS -X POST "$API/branches" "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d '{"name":"CI Second Site","timezone":"UTC"}' | json "['branch']['_id']")
COPIED=$(curl -fsS -X POST "$API/departments/copy" "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d "{\"fromBranch\":\"$BRANCH\",\"toBranch\":\"$NEW_BRANCH\"}" | json "['copied']")
echo "   copied $COPIED department(s) into the new branch"
test "$COPIED" -gt 0
# Re-running must skip rather than duplicate.
AGAIN=$(curl -fsS -X POST "$API/departments/copy" "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d "{\"fromBranch\":\"$BRANCH\",\"toBranch\":\"$NEW_BRANCH\"}" | json "['copied']")
echo "   copying again copied $AGAIN (expect 0 — already there)"
test "$AGAIN" = "0"

say "12. TENANT ISOLATION: a second org cannot see the first org's data"
RIVAL="rival-$(date +%s)-$RANDOM@ci-test.com"
OTHER=$(curl -fsS -X POST "$API/auth/register-org" -H 'Content-Type: application/json' \
  -d "{\"orgName\":\"CI Rival Bank\",\"industry\":\"bank\",\"name\":\"Rival Admin\",\"email\":\"$RIVAL\",\"password\":\"password123\"}" \
  | json "['accessToken']")
LEAKED=$(curl -fsS "$API/tokens/branch/$BRANCH" -H "Authorization: Bearer $OTHER" | len "['tokens']")
echo "   tokens from org A visible to org B: $LEAKED (expect 0)"
test "$LEAKED" = "0"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/departments" \
  -H "Authorization: Bearer $OTHER" -H 'Content-Type: application/json' \
  -d "{\"branch\":\"$BRANCH\",\"name\":\"Injected\",\"tokenPrefix\":\"X\"}")
echo "   cross-tenant department create -> HTTP $CODE (expect 404)"
test "$CODE" = "404"

say "13. The ETA model reports its self-learning state"
curl -fsS "$API/analytics/model" "${AUTH[@]}" | json "['status']"

printf '\n\033[32mAll end-to-end checks passed.\033[0m\n'
