#!/usr/bin/env bash
# Sets up a builder's worktree (.claude/agents/builder.md): checks it is clean, brings it up to
# date with main, installs packages (pnpm links from the shared store, so this is quick) and
# links the gitignored local files a builder may need from the main checkout. Prints one line:
# branch, HEAD and main short SHAs. Idempotent. Exit 1 on failure.
set -eu
fail() { echo "builder-setup: $1" >&2; exit 1; }
cd "$(dirname "$0")/.." || fail "cannot cd to repo"
main=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
[ -n "$main" ] || fail "cannot find the main checkout"
[ "$main" != "$(pwd)" ] || fail "run this in a builder worktree, not the main checkout"
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "worktree has uncommitted changes"
git fetch -q origin main || fail "fetch failed"
if [ "$(git rev-list --count origin/main..HEAD)" = 0 ]; then
  git reset --hard -q origin/main || fail "reset to main failed"
else
  git merge -q --no-edit origin/main >/dev/null 2>&1 || fail "merge main failed"
fi
pnpm install --frozen-lockfile --silent >/dev/null 2>&1 || fail "pnpm install failed"
# Local secrets stay in the main checkout; link, never copy (the repo is public).
for f in apps/api/.dev.vars apps/api/.env.cloudflare; do
  [ -e "$main/$f" ] && [ ! -e "$f" ] && ln -s "$main/$f" "$f"
done
echo "$(git rev-parse --abbrev-ref HEAD) $(git rev-parse --short HEAD) main $(git rev-parse --short origin/main)"
