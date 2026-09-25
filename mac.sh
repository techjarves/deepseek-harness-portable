#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
exec /bin/sh "$ROOT/scripts/portable.sh" macos-arm64 "$@"
