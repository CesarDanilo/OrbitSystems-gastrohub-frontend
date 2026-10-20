/**
 * Minimal JSON Schema validator for the subset used by qa/schema/qa-run.schema.json
 * (type, enum, required, properties, additionalProperties: false, items, minimum, $ref to
 * #/$defs). Avoids a dependency only to check the files the coordinator itself writes.
 */
const TYPE_CHECKS = {
  null: (v) => v === null,
  boolean: (v) => typeof v === 'boolean',
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  integer: (v) => Number.isInteger(v),
  array: (v) => Array.isArray(v),
  object: (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
};

function visit(schema, value, at, root, errors) {
  if (schema.$ref) {
    const target = root.$defs?.[schema.$ref.replace('#/$defs/', '')];
    if (!target) errors.push(`${at}: referência desconhecida ${schema.$ref}`);
    else visit(target, value, at, root, errors);
    return;
  }
  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.some((t) => TYPE_CHECKS[t]?.(value))) {
      errors.push(`${at}: esperado ${types.join(' | ')}`);
      return;
    }
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${at}: valor fora de [${schema.enum.join(', ')}]`);
  }
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${at}: menor que ${schema.minimum}`);
  }
  if (TYPE_CHECKS.object(value)) {
    const properties = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) errors.push(`${at}.${key}: obrigatório`);
    }
    for (const [key, sub] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) visit(sub, value[key], `${at}.${key}`, root, errors);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) errors.push(`${at}.${key}: campo não previsto`);
      }
    }
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => visit(schema.items, item, `${at}[${i}]`, root, errors));
  }
}

/** Returns the list of problems; empty when the value matches the schema. */
export function validate(schema, value) {
  const errors = [];
  visit(schema, value, '$', schema, errors);
  return errors;
}
