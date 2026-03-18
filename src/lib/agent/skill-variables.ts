import type { SkillVariable } from '@/lib/types';

/**
 * Interpolate {{variable}} placeholders in skill instructions.
 * Priority: override value > default_value > leave placeholder as-is.
 */
export function interpolateVariables(
  instructions: string,
  variables: SkillVariable[],
  overrides: Record<string, string>,
): string {
  const varMap = new Map<string, string>();

  for (const v of variables) {
    const value = overrides[v.key] ?? v.default_value;
    if (value) varMap.set(v.key, value);
  }

  return instructions.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return varMap.get(key) ?? match;
  });
}
