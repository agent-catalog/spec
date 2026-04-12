import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const schemaPath = resolve(__dirname, "../schema/agent-catalog-v1.schema.json");

let _schema = null;
export function getSchema() {
  if (!_schema) {
    _schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
  }
  return _schema;
}
