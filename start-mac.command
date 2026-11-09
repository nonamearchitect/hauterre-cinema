#!/bin/bash
cd "$(dirname "$0")"
[ -d node_modules/ws ] || npm install --omit=dev
(sleep 1; open http://localhost:8080) &
node server/relay.mjs
