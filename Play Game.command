#!/bin/zsh
cd "${0:A:h}"
if ! command -v npm >/dev/null 2>&1; then
  echo "Please install Node.js from https://nodejs.org, then reopen this launcher."
  read
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm install --cache "$TMPDIR/game-astra-npm" || exit 1
fi
npm run dev -- --open
