import { marked } from 'marked';

/**
 * Post-process marked HTML to produce TipTap-compatible task list markup.
 *
 * `marked` renders GFM task items in two forms depending on context:
 *   Simple:    <li><input type="checkbox"> text</li>
 *   Paragraph: <li><p><input checked="" type="checkbox"> text</p>\n</li>
 *
 * TipTap's TaskList/TaskItem extensions expect:
 *   <ul data-type="taskList">
 *     <li data-type="taskItem" data-checked="false"><p>text</p></li>
 *   </ul>
 */
function transformTaskLists(html: string): string {
  // Match any <input> checkbox (checked or unchecked) with arbitrary attribute order.
  // Captures: (1) everything before <input> inside <li>, (2) the input tag, (3) everything after.
  // We use a function replacer to handle both checked and paragraph-wrapped variants.
  html = html.replace(
    /<li>([\s\S]*?)<input\s+([\s\S]*?)>\s*([\s\S]*?)<\/li>/gi,
    (_match, before: string, attrs: string, after: string) => {
      // Determine checked state from attributes
      const isChecked = /\bchecked\b/.test(attrs);
      const checkedStr = isChecked ? 'true' : 'false';

      // Is this a checkbox? (skip non-checkbox inputs)
      if (!/type="checkbox"/.test(attrs) && !/\bchecked\b/.test(attrs)) {
        return _match;
      }

      // Strip wrapping <p>...</p> from before+after if present, then re-wrap cleanly
      let text = (before + after).trim();
      // Remove opening <p> and closing </p> tags so we can wrap uniformly
      text = text.replace(/^<p>\s*/i, '').replace(/\s*<\/p>$/i, '').trim();

      return `<li data-type="taskItem" data-checked="${checkedStr}"><p>${text}</p></li>`;
    }
  );

  // Mark any <ul> containing task items as a taskList
  html = html.replace(
    /<ul>([\s\S]*?)<\/ul>/gi,
    (_match, inner: string) => {
      if (inner.includes('data-type="taskItem"')) {
        return `<ul data-type="taskList">${inner}</ul>`;
      }
      return `<ul>${inner}</ul>`;
    }
  );

  return html;
}

export function markdownToHtml(md: string): string {
  const raw = marked.parse(md, { gfm: true, breaks: false }) as string;
  return transformTaskLists(raw);
}
