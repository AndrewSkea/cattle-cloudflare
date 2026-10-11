#!/usr/bin/env bash
# Runs after Claude in claude-feedback.yml. Decides what happens to Claude's work and reports on the issue:
#   question → Claude asked the family something (claude:needs-info)
#   nochange → nothing changed (claude:failed)
#   blocked  → touched something that must not ship unattended (claude:failed; branch pushed for a human)
#   ready    → committed and pushed to claude/feedback-<issue> for CI and deploy
# Needs: ISSUE, RUN_URL, GH_TOKEN, GH_REPO. Writes result= and sha= to $GITHUB_OUTPUT.
set -euo pipefail

out() { echo "$1" >> "${GITHUB_OUTPUT:-/dev/stdout}"; }
comment() { gh issue comment "$ISSUE" --body "$1"; }
fail_label() { gh issue edit "$ISSUE" --add-label "$1" --remove-label claude:working; }

git reset -q              # nothing staged by Claude counts
changed=$(git status --porcelain --untracked-files=all | grep -v ' \.feedback/' || true)

if [[ -s .feedback/question.md ]]; then
  git checkout -q -- . && git clean -fdq -e .feedback
  comment "$(cat .feedback/question.md)

_Answer in the app (Feedback → Recent requests) or reply here, and Claude will try again._
<!-- claude-question -->"
  fail_label claude:needs-info
  out result=question
  exit 0
fi

if [[ -z "$changed" ]]; then
  comment "🤷 Claude finished without changing anything. [See the run]($RUN_URL) — comment here with more detail to try again."
  fail_label claude:failed
  out result=nochange
  exit 0
fi

# Guard rails: things that must never ship without a person looking.
problems=()
while read -r status path; do
  case "$path" in
    .github/*) problems+=("changes CI/workflow files ($path)") ;;
    apps/worker/src/db/migrations/meta/*) ;;
    apps/worker/src/db/migrations/*)
      [[ "$status" != "??" ]] && problems+=("edits an existing migration ($path)")
      if [[ "$status" == "??" ]] && grep -Eiq 'DELETE FROM|DROP COLUMN|TRUNCATE' "$path"; then
        problems+=("adds a migration that deletes data or columns ($path)")
      elif [[ "$status" == "??" ]] && grep -Eiq 'DROP TABLE' "$path" && ! grep -q '__new_' "$path"; then
        problems+=("adds a migration that drops a table ($path)")
      fi ;;
  esac
done < <(git status --porcelain --untracked-files=all | sed -E 's/^(..) /\1\t/' | awk -F'\t' '{gsub(/ /,"",$1); print $1, $2}')

title=$(head -1 .feedback/title.txt 2>/dev/null || true)
[[ -z "$title" ]] && title="feat: $(gh issue view "$ISSUE" --json title --jq .title)"
summary=$(cat .feedback/summary.md 2>/dev/null || echo "- (no summary written)")
branch="claude/feedback-$ISSUE"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git checkout -q -B "$branch"
git add -A -- . ':!.feedback'
git commit -q -F - <<EOF
$title (#$ISSUE)

$summary

Requested in-app; implemented automatically by Claude. Refs #$ISSUE

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
sha=$(git rev-parse HEAD)
stat=$(git show --stat --format= HEAD | tail -1)

if (( ${#problems[@]} )); then
  pushed="Branch \`$branch\` has the change for review."
  git push -q -f origin "$branch" || pushed="The change could not be pushed (see the run)."
  comment "🛑 Claude made a change but it was **not deployed**, because it $(IFS=';'; echo "${problems[*]}" | sed 's/;/; /g'). $pushed [See the run]($RUN_URL)"
  fail_label claude:failed
  out result=blocked
  exit 0
fi

git push -q -f origin "$branch"
comment "🧪 Claude has made the change and its local tests pass. Running the full test suite, then deploying.

$summary

\`$title\` — $stat"
out result=ready
out "sha=$sha"
