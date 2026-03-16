import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * POST /api/skills/import — parse a SKILL.md file and create a skill.
 *
 * Accepts either:
 * - { spark_id, markdown: "---\nname: ...\n---\n..." }
 * - { spark_id, name, description, instructions } (pre-parsed)
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { spark_id, markdown } = body;

  if (markdown) {
    const parsed = parseSkillMarkdown(markdown);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid SKILL.md format. Expected YAML frontmatter with name and description.' },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from('skills')
      .insert({
        spark_id: spark_id || null,
        name: parsed.name,
        description: parsed.description,
        instructions: parsed.instructions,
        resources: [],
        tool_scope: parsed.tool_scope || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  }

  return NextResponse.json({ error: 'markdown field is required' }, { status: 400 });
}

/**
 * Parse SKILL.md format:
 * ---
 * name: skill-name
 * description: What this skill does
 * tool_scope: [tool1, tool2]  (optional)
 * ---
 * Instructions body...
 */
function parseSkillMarkdown(md: string): {
  name: string;
  description: string;
  instructions: string;
  tool_scope?: string[];
} | null {
  const frontmatterMatch = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!frontmatterMatch) return null;

  const [, frontmatter, body] = frontmatterMatch;
  const fields: Record<string, string> = {};

  for (const line of frontmatter.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    fields[key] = value;
  }

  if (!fields.name || !fields.description) return null;

  // Parse tool_scope if present (YAML array: [a, b, c] or quoted)
  let tool_scope: string[] | undefined;
  if (fields.tool_scope) {
    const arrayMatch = fields.tool_scope.match(/^\[(.+)\]$/);
    if (arrayMatch) {
      tool_scope = arrayMatch[1].split(',').map(s => s.trim().replace(/["']/g, ''));
    }
  }

  return {
    name: fields.name.replace(/["']/g, ''),
    description: fields.description.replace(/["']/g, ''),
    instructions: body.trim(),
    tool_scope,
  };
}
