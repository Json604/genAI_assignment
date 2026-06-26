const ALLOWED_KEYS = new Set([
  "type",
  "format",
  "title",
  "description",
  "nullable",
  "enum",
  "properties",
  "required",
  "items",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "pattern",
  "default",
  "anyOf",
]);

/** Strip JSON Schema fields Gemini rejects. */
export function sanitizeGeminiSchema(schema) {
  if (!schema || typeof schema !== "object") return { type: "object", properties: {} };

  const cleaned = {};
  for (const [key, value] of Object.entries(schema)) {
    if (!ALLOWED_KEYS.has(key)) continue;

    if (key === "properties" && value && typeof value === "object") {
      cleaned.properties = {};
      for (const [prop, propSchema] of Object.entries(value)) {
        cleaned.properties[prop] = sanitizeGeminiSchema(propSchema);
      }
      continue;
    }

    if (key === "items") {
      cleaned.items = sanitizeGeminiSchema(value);
      continue;
    }

    if (key === "anyOf" && Array.isArray(value)) {
      cleaned.anyOf = value.map((item) => sanitizeGeminiSchema(item));
      continue;
    }

    cleaned[key] = value;
  }

  if (!cleaned.type) cleaned.type = "object";
  return cleaned;
}