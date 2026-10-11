#!/bin/bash
cd "$(dirname "$0")"
git add -A
git commit -m "fix: SyntaxError en feed-familia.html (esc function)

- feed-familia.html: fix comillas en función esc() que rompían el parser HTML
- sw.js: cache version 19
"
git push origin dev
echo "✅ Push completado. Verificá en https://dev--cuidy-ar.netlify.app"
