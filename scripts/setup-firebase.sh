#!/usr/bin/env bash
# 운영 Firebase 설정 자동화. 다시 실행해도 안전하다.
# 사용: scripts/setup-firebase.sh <gcpProjectId> [location=asia-northeast3]
# SUPPORT_EMAIL=you@example.com 을 주면 Google 로그인 사용 설정까지 배포한다.
set -euo pipefail

PROJECT="${1:?usage: $0 <gcpProjectId> [location]}"
LOCATION="${2:-asia-northeast3}"
cd "$(dirname "$0")/.."
fb() { pnpm exec firebase "$@" --project "$PROJECT"; }
first_app_id() {
  fb apps:list WEB --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=(JSON.parse(s).result||[])[0];if(a)console.log(a.appId)})'
}

echo "[1/6] Firebase 추가"
# 이미 추가된 프로젝트면 실패할 수 있다. 이후 단계가 실제 상태를 검증한다.
fb projects:addfirebase "$PROJECT" || echo "  이미 추가됐거나 실패, 계속 진행"

echo "[2/6] Firestore 생성 ($LOCATION)"
if fb firestore:databases:get "(default)" >/dev/null 2>&1; then
  echo "  이미 있음, 건너뜀"
else
  fb firestore:databases:create "(default)" --location "$LOCATION"
fi

echo "[3/6] 웹 앱 등록"
APP_ID="$(first_app_id)"
if [ -z "$APP_ID" ]; then
  fb apps:create WEB sheet-quiz
  APP_ID="$(first_app_id)"
fi
[ -n "$APP_ID" ] || { echo "웹 앱 appId를 찾지 못했다" >&2; exit 1; }

echo "[4/6] .env.local 기록"
CFG="$(fb apps:sdkconfig WEB "$APP_ID" --json)"
cfgval() {
  printf '%s' "$CFG" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).result;console.log((r.sdkConfig||r)[process.argv[1]])})' "$1"
}
touch .env.local
set_env() {
  local key="$1" val="$2" cur
  cur="$(grep -E "^$key=" .env.local | head -1 | cut -d= -f2- || true)"
  if [ -z "$cur" ]; then
    echo "$key=$val" >> .env.local
    echo "  + $key"
  elif [ "$cur" != "$val" ]; then
    echo "  ! $key 이미 있음 (덮어쓰지 않음): 현재=$cur, firebase=$val"
  fi
}
set_env VITE_FIREBASE_API_KEY "$(cfgval apiKey)"
set_env VITE_FIREBASE_AUTH_DOMAIN "$(cfgval authDomain)"
set_env VITE_FIREBASE_PROJECT_ID "$(cfgval projectId)"

echo "[5/6] Google 로그인"
AUTH_MANUAL=1
if [ -n "${SUPPORT_EMAIL:-}" ]; then
  TMPCFG="$(mktemp -d)"
  cat > "$TMPCFG/firebase.json" <<JSON
{ "auth": { "providers": { "googleSignIn": { "oAuthBrandDisplayName": "풀이장", "supportEmail": "$SUPPORT_EMAIL" } } } }
JSON
  fb deploy --only auth --config "$TMPCFG/firebase.json" && AUTH_MANUAL=0
  rm -r "$TMPCFG"
else
  echo "  SUPPORT_EMAIL이 없어 건너뜀"
fi

echo "[6/6] Firestore rules 배포"
fb deploy --only firestore:rules

echo
echo "남은 수동 작업:"
[ "$AUTH_MANUAL" = 1 ] && echo "- Firebase 콘솔 > Authentication > Sign-in method > Google 사용 설정"
echo "- Authentication > Settings > Authorized domains에 Vercel 도메인 추가"
echo "- Google Cloud 콘솔 > OAuth 동의 화면: drive.readonly, spreadsheets.readonly 범위 확인 (Testing 모드면 테스트 사용자 추가)"
echo "- 사용자 인증 정보: VITE_GOOGLE_CLIENT_ID의 Authorized JavaScript origins에 배포 도메인 확인"
echo "- Vercel 환경변수에 .env.local의 VITE_FIREBASE_* 3개 추가"
