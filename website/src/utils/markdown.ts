/**
 * Beyond Borders — Markdown Utility
 *
 * Converts markdown to HTML with custom class annotations
 * for the design system, and extracts scoring data.
 */

import { marked } from 'marked';

// ── Configure marked with custom renderer ──────────────────────────

const renderer = new marked.Renderer();

// Tables: add `md-table` class and wrap in `.table-wrapper` for scroll
renderer.table = function ({ header, rows }: { header: string; rows: string[] }) {
  const headerCells = header
    .map((cell: { text: string; header: boolean; align: string | null }) => {
      const align = cell.align ? ` style="text-align:${cell.align}"` : '';
      return `<th${align}>${cell.text}</th>`;
    })
    .join('');

  const bodyRows = rows
    .map((row: { text: string; header: boolean; align: string | null }[]) => {
      const cells = row
        .map((cell) => {
          const align = cell.align ? ` style="text-align:${cell.align}"` : '';
          return `<td${align}>${cell.text}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<div class="table-wrapper"><table class="md-table"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
};

// Blockquotes: add `md-blockquote` class
renderer.blockquote = function ({ raw }: { raw: string }) {
  return `<blockquote class="md-blockquote">${raw}</blockquote>\n`;
};

// Code blocks: add `md-code` class
renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
  const langAttr = lang ? ` class="language-${lang}"` : '';
  return `<pre class="md-code"><code${langAttr}>${text}</code></pre>\n`;
};

// Apply the custom renderer
marked.use({ renderer });

// ── Public API ─────────────────────────────────────────────────────

/**
 * Convert a markdown string to HTML.
 */
export function renderMarkdown(content: string): string {
  if (!content) return '';
  try {
    const result = marked.parse(content);
    // marked.parse can return string | Promise<string>; in sync mode it returns string
    return typeof result === 'string' ? result : '';
  } catch {
    return '';
  }
}

/**
 * Extract DVF scores from markdown content.
 *
 * Supports three patterns:
 *   1. Table row: `| Desirability | 9 |`
 *   2. Bold table: `| **Overall** | **8.4** |`
 *   3. Inline: `**Desirability Score:** 9/10`
 */
export function extractScores(content: string): {
  desirability: number;
  feasibility: number;
  viability: number;
  overall: number;
} {
  const scores = { desirability: 0, feasibility: 0, viability: 0, overall: 0 };

  if (!content) return scores;

  const dimensions = ['desirability', 'feasibility', 'viability', 'overall'] as const;

  for (const dim of dimensions) {
    // Pattern 1 & 2: Table rows
    // e.g. `| Desirability | 9 |` or `| **Overall** | **8.4** |`
    const tableRe = new RegExp(
      `\\|\\s*\\*{0,2}${dim}\\*{0,2}\\s*\\|\\s*\\*{0,2}([\\d.]+)\\*{0,2}\\s*\\|`,
      'i',
    );
    const tableMatch = content.match(tableRe);
    if (tableMatch) {
      scores[dim] = parseFloat(tableMatch[1]);
      continue;
    }

    // Pattern 3: Inline scores
    // e.g. `**Desirability Score:** 9/10`
    const inlineRe = new RegExp(
      `\\*{0,2}${dim}\\s*Score\\s*:?\\*{0,2}\\s*([\\d.]+)`,
      'i',
    );
    const inlineMatch = content.match(inlineRe);
    if (inlineMatch) {
      scores[dim] = parseFloat(inlineMatch[1]);
    }
  }

  return scores;
}
