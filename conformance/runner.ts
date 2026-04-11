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

interface CatalogShape {
  auth?: {
    identity?: Array<{ id: string }>;
    authorization?: Array<{ id: string }>;
  };
  apis?: Array<EntryWithRequires>;
  mcps?: Array<EntryWithRequires>;
  agents?: Array<EntryWithRequires>;
  skills?: Array<EntryWithRequires>;
  sdks?: Array<EntryWithRequires>;
  docs?: Array<EntryWithRequires>;
}

interface EntryWithRequires {
  id: string;
  requires?: { identity?: string; authorization?: string };
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
  if (!valid) {
    const errors = (validate.errors ?? []).map((e) => {
      const path = e.instancePath || "(root)";
      return `${path}: ${e.message ?? "unknown error"}`;
    });
    return { valid: false, errors };
  }
  // Post-validation: check that every requires reference resolves
  const xrefErrors = checkCrossReferences(catalog as CatalogShape);
  if (xrefErrors.length > 0) {
    return { valid: false, errors: xrefErrors };
  }
  return { valid: true, errors: [] };
}

function checkCrossReferences(catalog: CatalogShape): string[] {
  const identityIds = new Set((catalog.auth?.identity ?? []).map((e) => e.id));
  const authorizationIds = new Set((catalog.auth?.authorization ?? []).map((e) => e.id));
  const errors: string[] = [];
  const collections: Array<[keyof CatalogShape, EntryWithRequires[] | undefined]> = [
    ["apis", catalog.apis],
    ["mcps", catalog.mcps],
    ["agents", catalog.agents],
    ["skills", catalog.skills],
    ["sdks", catalog.sdks],
    ["docs", catalog.docs],
  ];
  for (const [collectionName, entries] of collections) {
    if (!entries) continue;
    for (const entry of entries) {
      if (!entry.requires) continue;
      if (entry.requires.identity && !identityIds.has(entry.requires.identity)) {
        errors.push(`/${collectionName}/${entry.id}/requires/identity: dangling reference '${entry.requires.identity}'`);
      }
      if (entry.requires.authorization && !authorizationIds.has(entry.requires.authorization)) {
        errors.push(`/${collectionName}/${entry.id}/requires/authorization: dangling reference '${entry.requires.authorization}'`);
      }
    }
  }
  return errors;
}
