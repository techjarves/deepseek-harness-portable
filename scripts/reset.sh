#!/bin/sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)
[ -f "$ROOT/windows.bat" ] && [ -f "$ROOT/linux.sh" ] && [ -f "$ROOT/mac.sh" ] \
  || { printf 'Refusing reset: portable root validation failed.\n' >&2; exit 1; }

if [ "${1:-}" != "--yes" ]; then
  printf 'This removes DeepSeek Harness, runtimes, credentials, sessions, caches and logs.\n'
  printf 'models/ and bootstrap files are preserved. Type RESET to continue: '
  IFS= read -r answer
  [ "$answer" = RESET ] || { printf 'Cancelled.\n'; exit 1; }
fi
if command -v pkill >/dev/null 2>&1; then pkill -f "$ROOT/runtimes/.*/dsh" 2>/dev/null || true; fi
for item in data runtimes packages logs state temp app; do
  target="$ROOT/$item"
  [ -e "$target" ] || continue
  rm -rf -- "$target"
done
mkdir -p "$ROOT/models"
printf 'Portable DeepSeek Harness was reset. models/ was preserved.\n'
