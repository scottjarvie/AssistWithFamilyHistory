#!/usr/bin/env bash
# Only Claude cloud startup/resume runs setup. Local sessions do not write files.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
if ! cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null; then
  echo "Cloud setup: failed to enter the project directory."
  exit 0
fi
[ -f package.json ] || exit 0

log="${TMPDIR:-/tmp}/cloud-session-setup.log"
if ! { : > "$log"; } 2>/dev/null; then
  echo "Cloud setup: failed to create the setup log."
  exit 0
fi
fail() {
  printf 'Cloud setup: failed: %s See %s.\n' "$1" "$log"
  exit 0 # Setup failure is visible but must not block the session.
}

lock=pnpm-lock.yaml
[ -f "$lock" ] || fail "the required pnpm lockfile is missing."
[ -f .nvmrc ] || fail "the exact Node pin in .nvmrc is missing."
[ -n "${CLAUDE_ENV_FILE:-}" ] || fail "the session environment file is unavailable; Node and pnpm cannot be persisted."
want=$(tr -d '[:space:]' < .nvmrc)
want=${want#v}
[[ "$want" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail ".nvmrc must pin an exact Node version."

# Select and verify the exact patch version before considering a resume receipt.
have=$(node -p 'process.versions.node' 2>> "$log")
if [ "$have" != "$want" ]; then
  nvm_sh="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  [ -s "$nvm_sh" ] || fail "Node $want is required (found ${have:-none}); nvm is unavailable."
  . "$nvm_sh" >> "$log" 2>&1 || fail "loading nvm failed."
  nvm install "$want" >> "$log" 2>&1 || fail "nvm install $want failed."
  nvm use "$want" >> "$log" 2>&1 || fail "nvm use $want failed."
  have=$(node -p 'process.versions.node' 2>> "$log")
  [ "$have" = "$want" ] || fail "Node $want is required after nvm selection (found ${have:-none})."
fi

# Do not install global shims. Corepack uses package.json's pinned pnpm release.
pm_spec=$(node -p 'JSON.parse(require("node:fs").readFileSync("package.json", "utf8")).packageManager || ""' 2>> "$log") || fail "package.json could not be read."
[[ "$pm_spec" =~ ^pnpm@([0-9]+\.[0-9]+\.[0-9]+)(\+.*)?$ ]] || fail "package.json must pin pnpm."
want_pnpm=${BASH_REMATCH[1]}
command -v corepack >/dev/null 2>&1 || fail "Corepack is unavailable for pinned pnpm $want_pnpm."
corepack_path=$(command -v corepack)
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
have_pnpm=$(corepack pnpm --version 2>> "$log") || fail "pinned pnpm could not be started through Corepack."
[ "$have_pnpm" = "$want_pnpm" ] || fail "pnpm $want_pnpm is required (found ${have_pnpm:-none})."

# Resume must restore both commands even when dependencies need no work.
session_bin="$PWD/node_modules/.cloud-session-bin"
node_dir=$(dirname "$(command -v node)")
{ printf 'export PATH=%q:%q:"$PATH"\n' "$session_bin" "$node_dir" >> "$CLAUDE_ENV_FILE"; } 2>> "$log" || fail "the session PATH could not be saved."
save_pnpm_command() {
  mkdir -p "$session_bin" >> "$log" 2>&1 || fail "the project-local pnpm directory could not be created."
  { printf '#!/usr/bin/env bash\nexec %q pnpm "$@"\n' "$corepack_path" > "$session_bin/pnpm"; } 2>> "$log" || fail "the project-local pnpm command could not be saved."
  chmod +x "$session_bin/pnpm" >> "$log" 2>&1 || fail "the project-local pnpm command could not be made executable."
}

# A receipt records a successful install for these inputs, not file timestamps.
# It is not an integrity scan of node_modules after arbitrary manual changes.
fingerprint=$(node -e '
  const fs = require("node:fs");
  const hash = require("node:crypto").createHash("sha256");
  for (const value of ["cloud-setup-v2-with-dev-dependencies", ...process.argv.slice(1), process.platform, process.arch, process.versions.modules]) {
    hash.update(value + "\0");
  }
  for (const file of [".nvmrc", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]) {
    if (!fs.existsSync(file)) continue;
    hash.update(file + "\0").update(fs.readFileSync(file)).update("\0");
  }
  console.log(hash.digest("hex"));
' "$have" "$pm_spec" "$have_pnpm" 2>> "$log") || fail "the dependency receipt could not be computed."
stamp=node_modules/.cloud-session-setup
if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$fingerprint" ]; then
  save_pnpm_command
  echo "Cloud setup: dependencies already installed for this lockfile, Node $have and pnpm $have_pnpm."
  exit 0
fi

# Invalidate an old success before install: a failed install may leave partial files.
rm -f "$stamp" >> "$log" 2>&1 || fail "the old dependency receipt could not be removed."
corepack pnpm install --frozen-lockfile --prod=false >> "$log" 2>&1
status=$?
[ "$status" -eq 0 ] || fail "dependency install from $lock failed (exit $status)."
save_pnpm_command
{ printf '%s\n' "$fingerprint" > "$stamp"; } 2>> "$log" || fail "the successful dependency receipt could not be written."
echo "Cloud setup: installed dependencies from $lock on Node $have with pnpm $have_pnpm."
exit 0
