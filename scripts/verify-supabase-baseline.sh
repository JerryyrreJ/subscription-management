#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

output_path="${1:-/tmp/subscription-manager-baseline-diff.sql}"
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

if [[ -z "$db_url" && -n "$db_password" && -f supabase/.temp/pooler-url ]]; then
  pooler_url="$(cat supabase/.temp/pooler-url)"
  db_url="$(POOLER_URL="$pooler_url" SUPABASE_DB_PASSWORD="$db_password" node -e '
    const url = new URL(process.env.POOLER_URL);
    url.password = process.env.SUPABASE_DB_PASSWORD;
    process.stdout.write(url.toString());
  ')"
fi

if [[ -z "$db_url" ]]; then
  echo "A database connection is required." >&2
  echo "Set SUPABASE_DB_URL, or link the project and add SUPABASE_DB_PASSWORD to the ignored .env.local file." >&2
  exit 1
fi

comparison_root="$(mktemp -d /tmp/subscription-baseline-check.XXXXXX)"
mkdir -p "$comparison_root/supabase/migrations"
cp supabase/config.toml "$comparison_root/supabase/config.toml"
cp supabase/migrations/20260615000100_baseline.sql "$comparison_root/supabase/migrations/"

: > "$output_path"

supabase db diff \
  --workdir "$comparison_root" \
  --db-url "$db_url" \
  --schema public \
  --use-migra \
  --output "$output_path"

if [[ -s "$output_path" ]]; then
  echo "Baseline differs from production. Review: $output_path" >&2
  exit 1
fi

echo "Baseline matches the production public schema (zero diff)."
