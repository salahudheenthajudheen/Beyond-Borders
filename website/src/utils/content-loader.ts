/**
 * Beyond Borders — Content Loader
 *
 * Reads all markdown content from the repo at build time.
 * Every function is synchronous (fs.readFileSync) because they only
 * run during Astro's static build step.
 */

import fs from 'node:fs';
import path from 'node:path';

// ── Repo root is one level above website/ ──────────────────────────
const REPO_ROOT = path.resolve(process.cwd(), '..');

// ── Paths ──────────────────────────────────────────────────────────
const COMPANIES_DIR = path.join(REPO_ROOT, 'companies');
const VERTICALS_DIR = path.join(REPO_ROOT, 'verticals');
const FRAMEWORKS_DIR = path.join(REPO_ROOT, 'frameworks');
const RESOURCES_DIR = path.join(REPO_ROOT, 'resources');

// ── Types ──────────────────────────────────────────────────────────

export interface Company {
  slug: string;
  name: string;
  summary: string;
  overview: string;
  technology: string;
  usecaseCount: number;
  projectCount: number;
  verticals: string[];
}

export interface Scores {
  desirability: number;
  feasibility: number;
  viability: number;
  overall: number;
}

export interface ProblemStatement {
  slug: string;
  title: string;
  content: string;
  scores: Scores;
}

export interface UsecaseVertical {
  vertical: string;
  problems: ProblemStatement[];
}

export interface ProjectEntry {
  slug: string;
  title: string;
  content: string;
}

export interface CompanyDetail {
  slug: string;
  name: string;
  summary: string;
  overview: string;
  technology: string;
  readme: string;
  usecases: UsecaseVertical[];
  projects: ProjectEntry[];
  startups: ProjectEntry[];
  research: string;
}

export interface Vertical {
  slug: string;
  name: string;
  content: string;
  usecaseCount: number;
  companies: string[];
}

export interface Framework {
  slug: string;
  title: string;
  content: string;
}

export interface Resources {
  glossary: string;
  reading: string;
}

export interface TemplateEntry {
  slug: string;
  title: string;
  content: string;
}

// ── Helpers ────────────────────────────────────────────────────────

/** Safely read a file, returning empty string on failure. */
function safeRead(filePath: string): string {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch {
    // Silently ignore — missing files are expected during builds.
  }
  return '';
}

/** Safely list a directory, returning empty array on failure. */
function safeReaddir(dirPath: string): string[] {
  try {
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      return fs.readdirSync(dirPath);
    }
  } catch {
    // Silently ignore
  }
  return [];
}

/**
 * Extract the first `# ` heading from markdown.
 * Returns an empty string if no heading is found.
 */
export function extractTitle(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : '';
}

/**
 * Extract the content between `## sectionName` and the next `## ` or end of file.
 * Returns an empty string if the section is not found.
 */
export function extractSection(markdown: string, sectionName: string): string {
  // Escape special regex chars in section name
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `^##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=^##\\s|$(?!\\n))`,
    'm',
  );
  const match = markdown.match(regex);
  return match ? match[1].trim() : '';
}

/**
 * Extract scores from markdown content.
 * Supports two patterns:
 *   1. Table: `| Desirability | 9 |` or `| **Overall** | **8.4** |`
 *   2. Inline: `**Desirability Score:** 9/10`
 */
function extractScores(content: string): Scores {
  const scores: Scores = { desirability: 0, feasibility: 0, viability: 0, overall: 0 };

  const dimensions: (keyof Scores)[] = ['desirability', 'feasibility', 'viability', 'overall'];

  for (const dim of dimensions) {
    // Pattern 1: Table row   | Desirability | 9 |  or  | **Overall** | **8.4** |
    const tableRe = new RegExp(
      `\\|\\s*\\*{0,2}${dim}\\*{0,2}\\s*\\|\\s*\\*{0,2}([\\d.]+)\\*{0,2}\\s*\\|`,
      'i',
    );
    const tableMatch = content.match(tableRe);
    if (tableMatch) {
      scores[dim] = parseFloat(tableMatch[1]);
      continue;
    }

    // Pattern 2: Inline   **Desirability Score:** 9/10
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

// ── Public API ─────────────────────────────────────────────────────

/**
 * Get a lightweight listing of all companies.
 */
export function getCompanies(): Company[] {
  const entries = safeReaddir(COMPANIES_DIR);
  const companies: Company[] = [];

  for (const entry of entries) {
    const companyDir = path.join(COMPANIES_DIR, entry);

    // Only process directories
    try {
      if (!fs.statSync(companyDir).isDirectory()) continue;
    } catch {
      continue;
    }

    const slug = entry;
    const readme = safeRead(path.join(companyDir, 'README.md'));
    const overview = safeRead(path.join(companyDir, 'company-overview.md'));
    const technology = safeRead(path.join(companyDir, 'technology-overview.md'));

    const name = extractTitle(readme) || extractTitle(overview) || slug;

    // Try extracting "## One-Line Summary" section; fall back to first non-heading paragraph.
    let summary = extractSection(readme, 'One-Line Summary');
    if (!summary) {
      // Fallback: grab the first paragraph-like line after the heading
      const lines = readme.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('>') && !trimmed.startsWith('---')) {
          summary = trimmed;
          break;
        }
      }
    }

    // Count use cases (ps-*.md files across all vertical subdirs)
    let usecaseCount = 0;
    const usecasesDir = path.join(companyDir, 'usecases');
    const verticalDirs = safeReaddir(usecasesDir);
    const verticals: string[] = [];

    for (const vDir of verticalDirs) {
      const verticalPath = path.join(usecasesDir, vDir);
      try {
        if (!fs.statSync(verticalPath).isDirectory()) continue;
      } catch {
        continue;
      }
      verticals.push(vDir);

      const files = safeReaddir(verticalPath);
      for (const f of files) {
        if (f.startsWith('ps-') && f.endsWith('.md')) {
          usecaseCount++;
        }
      }
    }

    // Count projects (*.md files excluding README.md)
    let projectCount = 0;
    const projectsDir = path.join(companyDir, 'projects');
    const projectFiles = safeReaddir(projectsDir);
    for (const f of projectFiles) {
      if (f.endsWith('.md') && f.toLowerCase() !== 'readme.md') {
        projectCount++;
      }
    }

    companies.push({
      slug,
      name,
      summary,
      overview,
      technology,
      usecaseCount,
      projectCount,
      verticals,
    });
  }

  return companies;
}

/**
 * Get full detail for a single company by slug.
 */
export function getCompanyDetail(slug: string): CompanyDetail | null {
  const companyDir = path.join(COMPANIES_DIR, slug);

  try {
    if (!fs.existsSync(companyDir) || !fs.statSync(companyDir).isDirectory()) {
      return null;
    }
  } catch {
    return null;
  }

  const readme = safeRead(path.join(companyDir, 'README.md'));
  const overview = safeRead(path.join(companyDir, 'company-overview.md'));
  const technology = safeRead(path.join(companyDir, 'technology-overview.md'));

  const name = extractTitle(readme) || extractTitle(overview) || slug;

  let summary = extractSection(readme, 'One-Line Summary');
  if (!summary) {
    const lines = readme.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('>') && !trimmed.startsWith('---')) {
        summary = trimmed;
        break;
      }
    }
  }

  // ── Use Cases ─────────────────────────────────────────────────
  const usecases: UsecaseVertical[] = [];
  const usecasesDir = path.join(companyDir, 'usecases');
  const verticalDirs = safeReaddir(usecasesDir);

  for (const vDir of verticalDirs) {
    const verticalPath = path.join(usecasesDir, vDir);
    try {
      if (!fs.statSync(verticalPath).isDirectory()) continue;
    } catch {
      continue;
    }

    const problems: ProblemStatement[] = [];
    const files = safeReaddir(verticalPath).filter(
      (f) => f.startsWith('ps-') && f.endsWith('.md'),
    );

    for (const file of files) {
      const content = safeRead(path.join(verticalPath, file));
      let title = extractTitle(content);

      // Strip common prefixes
      title = title
        .replace(/^PS-\d+:\s*/i, '')
        .replace(/^Use Case:\s*/i, '')
        .replace(/^Problem Statement:\s*/i, '');

      problems.push({
        slug: file.replace(/\.md$/, ''),
        title,
        content,
        scores: extractScores(content),
      });
    }

    if (problems.length > 0) {
      usecases.push({ vertical: vDir, problems });
    }
  }

  // ── Projects ──────────────────────────────────────────────────
  const projects: ProjectEntry[] = [];
  const projectsDir = path.join(companyDir, 'projects');
  const projectFiles = safeReaddir(projectsDir).filter(
    (f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md',
  );

  for (const file of projectFiles) {
    const content = safeRead(path.join(projectsDir, file));
    projects.push({
      slug: file.replace(/\.md$/, ''),
      title: extractTitle(content) || file.replace(/\.md$/, ''),
      content,
    });
  }

  // ── Startups ──────────────────────────────────────────────────
  const startups: ProjectEntry[] = [];
  const startupsDir = path.join(companyDir, 'startups');
  const startupFiles = safeReaddir(startupsDir).filter(
    (f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md',
  );

  for (const file of startupFiles) {
    const content = safeRead(path.join(startupsDir, file));
    startups.push({
      slug: file.replace(/\.md$/, ''),
      title: extractTitle(content) || file.replace(/\.md$/, ''),
      content,
    });
  }

  // ── Research ──────────────────────────────────────────────────
  const research = safeRead(path.join(companyDir, 'research', 'README.md'));

  return {
    slug,
    name,
    summary,
    overview,
    technology,
    readme,
    usecases,
    projects,
    startups,
    research,
  };
}

/**
 * Get all verticals with cross-referenced company use-case counts.
 */
export function getVerticals(): Vertical[] {
  const files = safeReaddir(VERTICALS_DIR).filter((f) => f.endsWith('.md'));
  const companies = getCompanies();
  const verticals: Vertical[] = [];

  for (const file of files) {
    const slug = file.replace(/\.md$/, '');
    const content = safeRead(path.join(VERTICALS_DIR, file));
    const name = extractTitle(content) || slug;

    // Cross-reference: count use cases across all companies for this vertical
    let usecaseCount = 0;
    const companyNames: string[] = [];

    for (const company of companies) {
      if (company.verticals.includes(slug)) {
        // Count the ps-*.md files for this vertical in this company
        const verticalUsecaseDir = path.join(
          COMPANIES_DIR,
          company.slug,
          'usecases',
          slug,
        );
        const psFiles = safeReaddir(verticalUsecaseDir).filter(
          (f) => f.startsWith('ps-') && f.endsWith('.md'),
        );
        if (psFiles.length > 0) {
          usecaseCount += psFiles.length;
          companyNames.push(company.slug);
        }
      }
    }

    verticals.push({
      slug,
      name,
      content,
      usecaseCount,
      companies: companyNames,
    });
  }

  return verticals;
}

/**
 * Get all framework documents.
 */
export function getFrameworks(): Framework[] {
  const files = safeReaddir(FRAMEWORKS_DIR).filter((f) => f.endsWith('.md'));
  const frameworks: Framework[] = [];

  for (const file of files) {
    const content = safeRead(path.join(FRAMEWORKS_DIR, file));
    frameworks.push({
      slug: file.replace(/\.md$/, ''),
      title: extractTitle(content) || file.replace(/\.md$/, ''),
      content,
    });
  }

  return frameworks;
}

/**
 * Get resource documents (glossary + recommended reading).
 */
export function getResources(): Resources {
  return {
    glossary: safeRead(path.join(RESOURCES_DIR, 'glossary.md')),
    reading: safeRead(path.join(RESOURCES_DIR, 'recommended-reading.md')),
  };
}

/**
 * Get template files from the repo root.
 */
export function getTemplates(): TemplateEntry[] {
  const templateFiles = [
    'usecase-template.md',
    'company-template.md',
    'project-template.md',
    'startup-template.md',
  ];

  const templates: TemplateEntry[] = [];

  for (const file of templateFiles) {
    const filePath = path.join(REPO_ROOT, file);
    const content = safeRead(filePath);
    if (content) {
      templates.push({
        slug: file.replace(/\.md$/, ''),
        title: extractTitle(content) || file.replace(/\.md$/, ''),
        content,
      });
    }
  }

  return templates;
}

/**
 * Get the CONTRIBUTING.md raw markdown.
 */
export function getContributing(): string {
  return safeRead(path.join(REPO_ROOT, 'CONTRIBUTING.md'));
}
