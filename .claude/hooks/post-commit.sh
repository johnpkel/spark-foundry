#!/bin/bash
# Post-commit hook: reminds Claude to update documentation after git commits

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only trigger for git commit commands
if echo "$COMMAND" | grep -q "git commit"; then
  echo "Documentation reminder: A commit was just made. Consider running /update-docs to keep the Fumadocs documentation in sync with the latest changes." >&2
fi

exit 0
