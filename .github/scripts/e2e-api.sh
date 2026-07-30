#!/usr/bin/env bash
#
# End-to-end API check used by CI. Exercises the platform the way real users do:
# an admin reads the branch's configuration, a customer joins from a room's QR
# with no account, and the COUNTER ITSELF signs in to call them — there are no
# staff accounts, the desk is the login.
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
PRINCIPAL=$(echo "$LOGIN" | json "['principal']")
ORG=$(echo "$LOGIN" | json "['organization']['name']")
CUSTOMER_WORD=$(echo "$LOGIN" | json "['organization']['terminology']['customer']")
echo "   principal=$PRINCIPAL  org='$ORG'  customers are '$CUSTOMER_WORD'"
test "$PRINCIPAL" = "user"
test "$CUSTOMER_WORD" = "Patient"

AUTH=(-H "Authorization: Bearer $TOKEN")

say "2. The branch exposes its departments and rooms"
BRANCH=$(curl -fsS "$API/branches" "${AUTH[@]}" | json "['branches'][0]['_id']")
ROOMS_JSON=$(curl -fsS "$API/rooms/branch/$BRANCH" "${AUTH[@]}")

# Work with the room that has an OPEN counter, mirroring real usage.
ROOM=$(echo "$ROOMS_JSON" | "$PY" -c "
import sys,json
rooms=json.load(sys.stdin)['rooms']
for r in rooms:
    if any(c['status']=='open' for c in r.get('counters',[])): print(r['_id']); break
else: print(rooms[0]['_id'])")
ROOM_NAME=$(echo "$ROOMS_JSON" | "$PY" -c "
import sys,json
rooms=json.load(sys.stdin)['rooms']
print(next(r['name'] for r in rooms if r['_id']=='$ROOM'))")
DEPT=$(echo "$ROOMS_JSON" | "$PY" -c "
import sys,json
rooms=json.load(sys.stdin)['rooms']
print(next(r for r in rooms if r['_id']=='$ROOM')['departments'][0]['_id'])")
echo "   branch=$BRANCH  staffed room='$ROOM_NAME'"

say "3. Every counter has a unique code AND its own sign-in email"
COUNTERS=$(curl -fsS "$API/counters/branch/$BRANCH" "${AUTH[@]}")
"$PY" - <<EOF
import json
cs = json.loads('''$COUNTERS''')['counters']
codes = [c['code'] for c in cs]
emails = [c['email'] for c in cs]
assert len(codes) == len(set(codes)), 'duplicate counter codes'
assert len(emails) == len(set(emails)), 'duplicate counter emails'
assert all(c.get('password') is None for c in cs), 'password hash leaked in API response'
print(f"   {len(cs)} counters, all uniquely coded; no password field exposed")
EOF

say "4. A ROOM's join page and display show only that room's departments"
ROOM_DEPTS=$(curl -fsS "$API/public/branch/$BRANCH/config?room=$ROOM" | len "['departments']")
ALL_DEPTS=$(curl -fsS "$API/public/branch/$BRANCH/config" | len "['departments']")
BOARD_AREA=$(curl -fsS "$API/public/board/$BRANCH?room=$ROOM" | json "['area']")
echo "   room offers $ROOM_DEPTS of $ALL_DEPTS departments; board titled '$BOARD_AREA'"
test "$ROOM_DEPTS" -lt "$ALL_DEPTS"
test "$BOARD_AREA" = "$ROOM_NAME"

say "5. A customer joins from the room QR (no account)"
JOIN=$(curl -fsS -X POST "$API/public/join" \
  -H 'Content-Type: application/json' \
  -d "{\"branchId\":\"$BRANCH\",\"departmentId\":\"$DEPT\",\"roomId\":\"$ROOM\",\"customerName\":\"CI Tester\",\"customerPhone\":\"+15550009999\"}")
TOKEN_ID=$(echo "$JOIN" | json "['tokenId']")
SESSION=$(echo "$JOIN" | json "['sessionToken']")
echo "   issued $(echo "$JOIN" | json "['tokenNumber']") for $(echo "$JOIN" | json "['departmentName']")"

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

say "8. THE COUNTER SIGNS IN AS ITSELF and calls the next customer"
# Rotate the open counter's password so we know it, exactly as an admin would.
OPEN_ID=$(echo "$COUNTERS" | "$PY" -c "
import sys,json
cs=json.load(sys.stdin)['counters']
print(next(c for c in cs if c['status']=='open')['_id'])")
OPEN_CODE=$(echo "$COUNTERS" | "$PY" -c "
import sys,json
cs=json.load(sys.stdin)['counters']
print(next(c for c in cs if c['status']=='open')['code'])")
CREDS=$(curl -fsS -X POST "$API/counters/$OPEN_ID/reset-password" "${AUTH[@]}")
CEMAIL=$(echo "$CREDS" | json "['credentials']['email']")
CPASS=$(echo "$CREDS" | json "['credentials']['password']")
echo "   admin issued credentials for $OPEN_CODE -> $CEMAIL"

CLOGIN=$(curl -fsS -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$CEMAIL\",\"password\":\"$CPASS\"}")
CPRINCIPAL=$(echo "$CLOGIN" | json "['principal']")
CTOKEN=$(echo "$CLOGIN" | json "['accessToken']")
echo "   counter signed in as principal='$CPRINCIPAL'"
test "$CPRINCIPAL" = "counter"
CAUTH=(-H "Authorization: Bearer $CTOKEN")

# No counterId is passed — the counter IS the principal.
CALLED=$(curl -fsS -X POST "$API/tokens/call-next" "${CAUTH[@]}" -H 'Content-Type: application/json' -d '{}')
CALLED_ID=$(echo "$CALLED" | json "['token']['_id']")
echo "   now serving $(echo "$CALLED" | json "['token']['tokenNumber']")"
curl -fsS -X PATCH "$API/tokens/$CALLED_ID/complete" "${CAUTH[@]}" \
  -H 'Content-Type: application/json' -d '{}' | json "['token']['status']"

say "9. An illegal state transition is rejected with 409"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/tokens/$CALLED_ID/complete" \
  "${CAUTH[@]}" -H 'Content-Type: application/json' -d '{}')
echo "   completing an already-completed token -> HTTP $CODE (expect 409)"
test "$CODE" = "409"

say "10. An ADMIN cannot call next, and a COUNTER cannot administer"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/tokens/call-next" \
  "${AUTH[@]}" -H 'Content-Type: application/json' -d '{}')
echo "   admin -> call-next  = HTTP $CODE (expect 403)"
test "$CODE" = "403"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API/branches" "${CAUTH[@]}" -X POST \
  -H 'Content-Type: application/json' -d '{"name":"Sneaky"}')
echo "   counter -> create branch = HTTP $CODE (expect 403)"
test "$CODE" = "403"

say "11. SEPARATION OF CONCERNS: a counter never serves another room's queue"
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
OUT=$(curl -fsS -X POST "$API/tokens/call-next" "${CAUTH[@]}" \
  -H 'Content-Type: application/json' -d '{}' | json "['token']")
echo "   $OPEN_CODE calling with only another room's token queued -> $OUT (expect None)"
test "$OUT" = "None"

say "12. NO-SHOW PENALTY: each miss drops them further, then out"
# Serve tokens until our target is the one at the counter, completing anyone
# called before them so the queue drains predictably.
serve_until() {
  local target="$1" out id
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    out=$(curl -fsS -X POST "$API/tokens/call-next" "${CAUTH[@]}" -H 'Content-Type: application/json' -d '{}')
    id=$(echo "$out" | "$PY" -c "import sys,json;t=json.load(sys.stdin).get('token');print(t['_id'] if t else '')")
    [ -z "$id" ] && return 1
    [ "$id" = "$target" ] && return 0
    curl -fsS -X PATCH "$API/tokens/$id/complete" "${CAUTH[@]}" \
      -H 'Content-Type: application/json' -d '{}' > /dev/null
  done
  return 1
}

# Queue enough people that there are real places to lose. These go in as
# walk-ins issued at the desk, which is both realistic and avoids the tight
# rate limit that (deliberately) guards the public join endpoint.
for i in 1 2 3 4 5 6 7 8; do
  curl -fsS -X POST "$API/tokens" "${CAUTH[@]}" -H 'Content-Type: application/json' \
    -d "{\"departmentId\":\"$DEPT\",\"customerName\":\"Queue $i\"}" > /dev/null
done

NS=$(curl -fsS -X POST "$API/tokens/call-next" "${CAUTH[@]}" -H 'Content-Type: application/json' -d '{}')
NS_ID=$(echo "$NS" | json "['token']['_id']")
NS_NUM=$(echo "$NS" | json "['token']['tokenNumber']")

R1=$(curl -fsS -X PATCH "$API/tokens/$NS_ID/no-show" "${CAUTH[@]}" -H 'Content-Type: application/json' -d '{}')
echo "   $NS_NUM 1st no-show -> $(echo "$R1" | json "['outcome']") at position $(echo "$R1" | json "['position']") (expect 2)"
test "$(echo "$R1" | json "['position']")" = "2"

serve_until "$NS_ID"
R2=$(curl -fsS -X PATCH "$API/tokens/$NS_ID/no-show" "${CAUTH[@]}" -H 'Content-Type: application/json' -d '{}')
echo "   $NS_NUM 2nd no-show -> position $(echo "$R2" | json "['position']") (expect 4)"
test "$(echo "$R2" | json "['position']")" = "4"

serve_until "$NS_ID"
R3=$(curl -fsS -X PATCH "$API/tokens/$NS_ID/no-show" "${CAUTH[@]}" -H 'Content-Type: application/json' -d '{}')
echo "   $NS_NUM 3rd no-show -> $(echo "$R3" | json "['outcome']") — the token is spent"
test "$(echo "$R3" | json "['outcome']")" = "removed"
STILL=$(curl -fsS "$API/tokens/branch/$BRANCH" "${CAUTH[@]}" | "$PY" -c "
import sys,json
print(sum(1 for t in json.load(sys.stdin)['tokens'] if t['_id']=='$NS_ID'))")
echo "   and it is no longer in the active queue: $STILL (expect 0)"
test "$STILL" = "0"


say "13. PRIORITY PASS requires a reason"
PT=$(curl -fsS "$API/tokens/branch/$BRANCH" "${CAUTH[@]}" | "$PY" -c "
import sys,json
ts=[t for t in json.load(sys.stdin)['tokens'] if t['status']=='waiting' and not t['isPriority']]
print(ts[0]['_id'])")
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/tokens/$PT/priority"   "${CAUTH[@]}" -H 'Content-Type: application/json' -d '{}')
echo "   priority with no reason -> HTTP $CODE (expect 400)"
test "$CODE" = "400"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/tokens/$PT/priority"   "${CAUTH[@]}" -H 'Content-Type: application/json' -d '{"reason":"x"}')
echo "   priority with a too-short reason -> HTTP $CODE (expect 400)"
test "$CODE" = "400"

GRANTED=$(curl -fsS -X PATCH "$API/tokens/$PT/priority" "${CAUTH[@]}"   -H 'Content-Type: application/json' -d '{"reason":"Elderly customer, unable to stand"}')
echo "   with a reason -> $(echo "$GRANTED" | json "['token']['isPriority']") | stored: $(echo "$GRANTED" | json "['token']['priorityReason']")"
test "$(echo "$GRANTED" | json "['token']['isPriority']")" = "True"

# And they now sort to the front of that queue.
FIRST=$(curl -fsS "$API/tokens/branch/$BRANCH" "${CAUTH[@]}" | "$PY" -c "
import sys,json
ts=[t for t in json.load(sys.stdin)['tokens'] if t['status']=='waiting']
print(ts[0]['_id'])")
echo "   priority token is now first in line: $([ "$FIRST" = "$PT" ] && echo yes || echo no)"
test "$FIRST" = "$PT"

say "14. Rooms accept no departments at creation, and stay editable"
NEW_ROOM=$(curl -fsS -X POST "$API/rooms" "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d "{\"branch\":\"$BRANCH\",\"name\":\"CI Flex Room\",\"code\":\"FLEX\"}" | json "['room']['_id']")
echo "   created a room with no departments"
UPDATED=$(curl -fsS -X PATCH "$API/rooms/$NEW_ROOM" "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d "{\"departments\":[\"$DEPT\",\"$OTHER_DEPT\"]}" | len "['room']['departments']")
echo "   then clubbed $UPDATED departments into it (expect 2)"
test "$UPDATED" = "2"

say "15. Departments can be copied to a new branch"
NEW_BRANCH=$(curl -fsS -X POST "$API/branches" "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d '{"name":"CI Second Site","timezone":"UTC"}' | json "['branch']['_id']")
COPIED=$(curl -fsS -X POST "$API/departments/copy" "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d "{\"fromBranch\":\"$BRANCH\",\"toBranch\":\"$NEW_BRANCH\"}" | json "['copied']")
AGAIN=$(curl -fsS -X POST "$API/departments/copy" "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d "{\"fromBranch\":\"$BRANCH\",\"toBranch\":\"$NEW_BRANCH\"}" | json "['copied']")
echo "   copied $COPIED department(s); re-running copied $AGAIN (expect 0)"
test "$COPIED" -gt 0
test "$AGAIN" = "0"

say "16. TENANT ISOLATION: a second org cannot see the first org's data"
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

say "17. The ETA model reports its self-learning state"
curl -fsS "$API/analytics/model" "${AUTH[@]}" | json "['status']"

printf '\n\033[32mAll end-to-end checks passed.\033[0m\n'
