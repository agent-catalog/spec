import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

let cachedValidator: ValidateFunction | null = null;

export async function loadValidator(): Promise<ValidateFunction> {
  if (cachedValidator) return cachedValidator;
  const schemaPath = resolve(__dirname, "../schema/agent-catalog-v1.schema.json");
  const schemaText = await readFile(schemaPath, "utf-8");
  const schema = JSON.parse(schemaText);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  cachedValidator = ajv.compile(schema);
  return cachedValidator;
}

export async function validateCatalog(catalog: unknown): Promise<ValidationResult> {
  const validate = await loadValidator();
  const valid = validate(catalog) as boolean;
  if (valid) return { valid: true, errors: [] };
  const errors = (validate.errors ?? []).map((e) => {
    const path = e.instancePath || "(root)";
    return `${path}: ${e.message ?? "unknown error"}`;
  });
  return { valid: false, errors };
}
