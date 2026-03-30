#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VARIANT_NAME="${1:-}"
VARIANT_DIR="$ROOT_DIR/app/favicon-variants"
SOURCE_SVG="$VARIANT_DIR/${VARIANT_NAME}.svg"
TARGET_ICON_SVG="$ROOT_DIR/app/icon.svg"
TARGET_FAVICON_ICO="$ROOT_DIR/app/favicon.ico"
TARGET_APPLE_ICON="$ROOT_DIR/app/apple-icon.png"

if [[ -z "$VARIANT_NAME" ]]; then
  echo "Usage: $0 <variant-name>"
  echo "Available variants:"
  ls -1 "$VARIANT_DIR" | sed 's/\.svg$//' | sed 's/^/- /'
  exit 1
fi

if [[ ! -f "$SOURCE_SVG" ]]; then
  echo "Variant not found: $VARIANT_NAME"
  echo "Available variants:"
  ls -1 "$VARIANT_DIR" | sed 's/\.svg$//' | sed 's/^/- /'
  exit 1
fi

if ! command -v sips >/dev/null 2>&1; then
  echo "Missing required tool: sips"
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Missing required tool: ffmpeg"
  exit 1
fi

cp "$SOURCE_SVG" "$TARGET_ICON_SVG"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

sips -s format png -z 256 256 "$TARGET_ICON_SVG" --out "$TMP_DIR/favicon-256.png" >/dev/null
ffmpeg -y -i "$TMP_DIR/favicon-256.png" "$TARGET_FAVICON_ICO" >/dev/null 2>&1
sips -s format png -z 180 180 "$TARGET_ICON_SVG" --out "$TARGET_APPLE_ICON" >/dev/null

echo "Applied favicon variant: $VARIANT_NAME"
echo "- icon.svg updated"
echo "- favicon.ico regenerated"
echo "- apple-icon.png regenerated"
