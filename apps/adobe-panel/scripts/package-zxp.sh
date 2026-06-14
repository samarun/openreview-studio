#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist-package"
CERTS_DIR="$ROOT_DIR/.certs"
OUTPUT_ZXP="$ROOT_DIR/dist/openreview-panel.zxp"
CERT_FILE="$CERTS_DIR/dev-cert.p12"
CERT_PASSWORD="${ZXP_CERT_PASSWORD:-OpenReviewDev}"
ZXPSIGNCMD="${ZXPSIGNCMD:-ZXPSignCmd}"

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Package the OpenReview Studio Adobe CEP panel into a signed .zxp file.

Options:
  --cert FILE        Path to a .p12 signing certificate (default: auto-generated dev cert)
  --password PASS    Certificate password (default: \$ZXP_CERT_PASSWORD or "OpenReviewDev")
  --skip-sign        Create an unsigned .zxp (zip) without ZXPSignCmd
  --help             Show this help message

Environment variables:
  ZXP_CERT_PASSWORD  Certificate password (overridden by --password)
  ZXPSIGNCMD         Path to ZXPSignCmd binary (default: ZXPSignCmd on PATH)
EOF
  exit 0
}

SKIP_SIGN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cert)       CERT_FILE="$2"; shift 2 ;;
    --password)   CERT_PASSWORD="$2"; shift 2 ;;
    --skip-sign)  SKIP_SIGN=true; shift ;;
    --help)       usage ;;
    *)            echo "Unknown option: $1"; usage ;;
  esac
done

echo "==> Building panel TypeScript..."
pnpm --filter @openreview/adobe-panel build

echo "==> Assembling extension package..."
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR" "$(dirname "$OUTPUT_ZXP")"

cp "$ROOT_DIR/index.html" "$ROOT_DIR/host.jsx" "$ROOT_DIR/manifest.xml" "$DIST_DIR/"
cp "$ROOT_DIR/dist/panel.js" "$DIST_DIR/"

if [[ "$SKIP_SIGN" == "true" ]]; then
  echo "==> Creating unsigned .zxp (zip archive)..."
  (cd "$DIST_DIR" && zip -r "$OUTPUT_ZXP" .)
  echo "Done: $OUTPUT_ZXP (unsigned)"
  echo "Install with: ExManCmd --install \"$OUTPUT_ZXP\""
  exit 0
fi

if ! command -v "$ZXPSIGNCMD" &>/dev/null; then
  echo ""
  echo "ZXPSignCmd not found on PATH."
  echo "Download it from: https://github.com/nicolo-ribaudo/create-zxp-certificate"
  echo "Or set ZXPSIGNCMD=/path/to/ZXPSignCmd"
  echo ""
  echo "To create an unsigned package instead, re-run with --skip-sign"
  exit 1
fi

if [[ ! -f "$CERT_FILE" ]]; then
  echo "==> Generating self-signed development certificate..."
  mkdir -p "$CERTS_DIR"

  "$ZXPSIGNCMD" -selfSignedCert \
    US OpenReview "OpenReview Studio" "$CERT_PASSWORD" "$CERT_FILE" \
    -validityDays 3650

  echo "    Certificate: $CERT_FILE"
  echo "    This is for development only. Use a proper certificate for production."
fi

echo "==> Signing extension with ZXPSignCmd..."
rm -f "$OUTPUT_ZXP"
"$ZXPSIGNCMD" -sign "$DIST_DIR" "$OUTPUT_ZXP" "$CERT_FILE" "$CERT_PASSWORD" -tsa http://timestamp.digicert.com

echo ""
echo "Done: $OUTPUT_ZXP"
echo "Install with: ExManCmd --install \"$OUTPUT_ZXP\""
