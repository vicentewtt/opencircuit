import { CATEGORIES } from './categories';
import { MAX_CODE_LENGTH, type PartDef, type PartProps } from './types';

// Every file in parts/ is picked up automatically: no central list to edit.
const modules = import.meta.glob<{ default: PartDef }>(['./parts/*.ts', '!./parts/*.test.ts'], {
  eager: true,
});

const defsByType = new Map<string, PartDef>();
for (const [path, module] of Object.entries(modules)) {
  const def = module.default;
  if (defsByType.has(def.type)) {
    throw new Error(`Duplicate part type "${def.type}" in ${path}`);
  }
  defsByType.set(def.type, def);
}

const categoryOrder = new Map(CATEGORIES.map((category, index) => [category.id, index]));

/** All parts, ordered by category and then by name. */
export const PART_DEFS: readonly PartDef[] = [...defsByType.values()].sort(
  (a, b) =>
    (categoryOrder.get(a.category) ?? 0) - (categoryOrder.get(b.category) ?? 0) ||
    a.name.en.localeCompare(b.name.en),
);

export function getPartDef(type: string): PartDef | undefined {
  return defsByType.get(type);
}

export function requirePartDef(type: string): PartDef {
  const def = defsByType.get(type);
  if (!def) throw new Error(`Unknown part type: ${type}`);
  return def;
}

export function defaultProps(def: PartDef): PartProps {
  const props: PartProps = {};
  for (const prop of def.props) props[prop.key] = prop.default;
  return props;
}

/**
 * Builds a valid props object from untrusted data: unknown keys are dropped,
 * numbers are clamped to their range and anything invalid falls back to the default.
 */
export function normalizeProps(def: PartDef, raw: unknown): PartProps {
  const source: Record<string, unknown> =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const props: PartProps = {};
  for (const prop of def.props) {
    const value = Object.hasOwn(source, prop.key) ? source[prop.key] : undefined;
    if (prop.kind === 'number') {
      props[prop.key] =
        typeof value === 'number' && Number.isFinite(value)
          ? Math.min(prop.max, Math.max(prop.min, value))
          : prop.default;
    } else if (prop.kind === 'code') {
      props[prop.key] =
        typeof value === 'string' && value.length <= MAX_CODE_LENGTH ? value : prop.default;
    } else {
      props[prop.key] =
        typeof value === 'string' && prop.options.some((option) => option.value === value)
          ? value
          : prop.default;
    }
  }
  return props;
}
