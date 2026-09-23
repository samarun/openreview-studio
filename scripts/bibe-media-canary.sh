#!/usr/bin/env bash
# Exercise local upload, queue processing, proxy and thumbnail generation.
set -euo pipefail

base_url="${BIBE_CANARY_URL:-http://127.0.0.1:8088}"
project_id="${BIBE_CANARY_PROJECT_ID:-demo-project}"
media_file="${BIBE_CANARY_MEDIA_FILE:-}"
generated_media=false

[[ "$base_url" =~ ^http://127[.]0[.]0[.]1:[0-9]+$ ]] || {
  echo "The media canary accepts only a loopback HTTP endpoint." >&2
  exit 2
}

for command_name in curl jq; do
  command -v "$command_name" >/dev/null || {
    echo "$command_name is required for the media canary." >&2
    exit 1
  }
done

cleanup() {
  if [[ "$generated_media" == "true" ]]; then
    rm -f -- "$media_file"
  fi
}
trap cleanup EXIT

if [[ -z "$media_file" ]]; then
  command -v ffmpeg >/dev/null || {
    echo "ffmpeg is required to generate the test video." >&2
    exit 1
  }
  media_file="$(mktemp -t bibe-canary.XXXXXX)"
  generated_media=true
  ffmpeg -hide_banner -loglevel error \
    -f lavfi -i color=c=blue:s=320x180:d=1 \
    -f lavfi -i sine=frequency=1000:duration=1 \
    -shortest -c:v libx264 -pix_fmt yuv420p -c:a aac \
    -f mp4 -y "$media_file"
fi
[[ -r "$media_file" ]] || { echo "Media file is not readable." >&2; exit 1; }
size_bytes="$(wc -c < "$media_file" | tr -d ' ')"

login_response="$(curl --fail --silent --show-error \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@openreview.local","password":"openreview-demo"}' \
  "$base_url/api/auth/login")"
token="$(jq -er '.token' <<< "$login_response")"

presign_payload="$(jq -n \
  --arg projectId "$project_id" \
  --arg filename bibe-canary.mp4 \
  --arg contentType video/mp4 \
  --argjson sizeBytes "$size_bytes" \
  '{projectId:$projectId,filename:$filename,contentType:$contentType,sizeBytes:$sizeBytes}')"
presign_response="$(curl --fail --silent --show-error \
  -H "Authorization: Bearer $token" \
  -H 'Content-Type: application/json' \
  --data-binary "$presign_payload" \
  "$base_url/api/uploads/presign")"
upload_url="$(jq -er '.uploadUrl' <<< "$presign_response")"
original_key="$(jq -er '.originalKey' <<< "$presign_response")"
[[ "$upload_url" == "$base_url/"* ]] || {
  echo "Presigned upload URL is outside the local gateway." >&2
  exit 1
}

curl --fail --silent --show-error \
  -X PUT -H 'Content-Type: video/mp4' \
  --upload-file "$media_file" "$upload_url" >/dev/null

asset_payload="$(jq -n \
  --arg projectId "$project_id" \
  --arg name "Mac BIBE canary $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg originalKey "$original_key" \
  '{projectId:$projectId,name:$name,originalKey:$originalKey}')"
asset_response="$(curl --fail --silent --show-error \
  -H "Authorization: Bearer $token" \
  -H 'Content-Type: application/json' \
  --data-binary "$asset_payload" \
  "$base_url/api/assets")"
asset_id="$(jq -er '.id' <<< "$asset_response")"
version_id="$(jq -er '.versions[0].id' <<< "$asset_response")"

status=""
status_response=""
for _ in $(seq 1 60); do
  status_response="$(curl --fail --silent --show-error \
    -H "Authorization: Bearer $token" \
    "$base_url/api/versions/$version_id/status")"
  status="$(jq -er '.status' <<< "$status_response")"
  case "$status" in
    READY|FAILED) break ;;
  esac
  sleep 2
done

if [[ "$status" != "READY" ]]; then
  echo "Media canary did not reach READY: $status" >&2
  jq '{status,failureReason}' <<< "$status_response" >&2
  exit 1
fi

jq -e '.proxyKey and .thumbnailKey' <<< "$status_response" >/dev/null
curl --fail --silent --show-error -L \
  -H "Authorization: Bearer $token" \
  "$base_url/api/assets/$asset_id/versions/$version_id/download?type=proxy" \
  -o /dev/null
frame_type="$(curl --fail --silent --show-error \
  -H "Authorization: Bearer $token" \
  -o /dev/null -w '%{content_type}' \
  "$base_url/api/versions/$version_id/frame?time=0")"
[[ "$frame_type" == image/jpeg* ]] || {
  echo "Thumbnail request returned $frame_type instead of image/jpeg." >&2
  exit 1
}

echo "Local media canary passed: upload, worker READY, proxy download and JPEG frame."
echo "Local asset ID: $asset_id"
