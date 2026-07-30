#!/usr/bin/env bash
#
# Publish site/ to the public GitHub Pages repo.
#
#   ./site/deploy.sh            publish
#   ./site/deploy.sh --dry-run  show what would change, push nothing
#
# WHY NOT `git subtree push`
# The source repo has hundreds of commits and subtree walks all of them to
# compute the split — it ran past two minutes here. It would also copy this
# repo's commit messages into a public repo, and those reference internal
# context (branch names, TODO findings, other work in flight) that has no
# reason to be published.
#
# Instead this syncs the *contents* into a clone of the public repo and makes
# one commit there. History in the public repo stays linear and readable, no
# force-push is needed, and nothing internal leaks.

set -euo pipefail

REPO="https://github.com/Dinesh210805/aura-app.git"
BRANCH="main"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="${TMPDIR:-/tmp}/aura-site-deploy"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

echo "source : $SRC"
echo "target : $REPO ($BRANCH)"

# Fresh clone every time: the public repo is a publishing target, never a place
# work happens, so there is never a local change worth preserving.
rm -rf "$WORK"
git clone --quiet --depth 1 "$REPO" "$WORK" 2>/dev/null || {
  git clone --quiet "$REPO" "$WORK"
}
cd "$WORK"
git checkout -q -B "$BRANCH"

# Replace tracked content wholesale so deletions propagate. Anything not in
# site/ should not survive in the published repo.
find . -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +

# -a preserves the dotfiles that matter (.nojekyll), which a bare glob misses.
cp -a "$SRC/." .

# Files that exist to build the site, not to be served by it.
rm -f deploy.sh README.md

git add -A

if git diff --cached --quiet; then
  echo "no changes — nothing to publish"
  exit 0
fi

echo
echo "--- changes ---"
git diff --cached --stat

if [[ $DRY_RUN -eq 1 ]]; then
  echo
  echo "dry run: nothing pushed"
  exit 0
fi

# The published repo is generated output, so the message points at the commit
# that produced it rather than restating it.
SRC_SHA="$(cd "$SRC" && git rev-parse --short HEAD)"
git -c user.name="AURA site deploy" -c user.email="dinesh210805@gmail.com" \
    commit -q -m "Publish site (source $SRC_SHA)"

git push -q origin "$BRANCH"
echo
echo "published → https://dinesh210805.github.io/aura-app/"
