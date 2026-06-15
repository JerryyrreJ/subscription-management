#!/usr/bin/env bash
set -euo pipefail

output_path="${1:-/tmp/subscription-manager-production-schema.sql}"
db_url="${SUPABASE_DB_URL:-}"
db_password="${SUPABASE_DB_PASSWORD:-}"

if [[ -z "$db_password" && -f .env.local ]]; then
  db_password="$(node -e '
    const fs = require("fs");
    const line = fs.readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .find(entry => entry.startsWith("SUPABASE_DB_PASSWORD="));
    if (!line) process.exit(0);
    let value = line.slice(line.indexOf("=") + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("\047") && value.endsWith("\047"))) {
      value = value.slice(1, -1);
    }
    process.stdout.write(value);
  ')"
fi

dump_args=(
  --schema public
  --keep-comments
  --file "$output_path"
)

if [[ -n "$db_url" ]]; then
  dump_args+=(--db-url "$db_url")
elif [[ -n "$db_password" && -f supabase/.temp/pooler-url ]]; then
  pooler_url="$(cat supabase/.temp/pooler-url)"
  db_url="$(POOLER_URL="$pooler_url" SUPABASE_DB_PASSWORD="$db_password" node -e '
    const url = new URL(process.env.POOLER_URL);
    url.password = process.env.SUPABASE_DB_PASSWORD;
    process.stdout.write(url.toString());
  ')"
  dump_args+=(--db-url "$db_url")
else
  echo "A database connection is required." >&2
  echo "Set SUPABASE_DB_URL, or link the project and add SUPABASE_DB_PASSWORD to the ignored .env.local file." >&2
  echo "Never use SUPABASE_SERVICE_ROLE_KEY as a database password." >&2
  exit 1
fi

supabase db dump "${dump_args[@]}"

echo "Read-only schema dump written to $output_path"
