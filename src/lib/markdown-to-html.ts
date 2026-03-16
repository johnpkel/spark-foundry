import { marked } from 'marked';

export function markdownToHtml(md: string): string {
  return marked.parse(md, { gfm: true, breaks: false }) as string;
}
