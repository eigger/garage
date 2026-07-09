import { writeFileSync } from "node:fs";
import { buildItemKeyMigrationSql } from "@garage/shared";

const path =
  "apps/api/prisma/migrations/20260709195000_catalog_item_keys_and_push_locale/migration.sql";

writeFileSync(
  path,
  `ALTER TABLE "PushSubscription" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'ko';\n\n${buildItemKeyMigrationSql()}\n`,
  "utf8",
);

console.log(`Wrote ${path}`);
