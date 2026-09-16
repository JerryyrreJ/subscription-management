export type BlogStatus = 'draft' | 'published';

export type BlogFrontmatter = {
  title: string;
  slug: string;
  description: string;
  date: string;
  updated?: string;
  status: BlogStatus;
  lang: string;
};

const REQUIRED_FIELDS = ['title', 'slug', 'description', 'date', 'status'] as const;

export function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error('Markdown post is missing YAML frontmatter');
  }

  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }

    const separator = line.indexOf(':');
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }

  return { data, body: match[2].replace(/^\uFEFF/, '').trim() };
}

export function toFrontmatter(data: Record<string, string>): BlogFrontmatter {
  for (const field of REQUIRED_FIELDS) {
    if (!data[field]?.trim()) {
      throw new Error(`Missing required frontmatter field: ${field}`);
    }
  }

  if (data.status !== 'draft' && data.status !== 'published') {
    throw new Error(`Invalid status "${data.status}" (use draft or published)`);
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)) {
    throw new Error(`Invalid slug "${data.slug}"`);
  }

  return {
    title: data.title,
    slug: data.slug,
    description: data.description,
    date: data.date,
    updated: data.updated,
    status: data.status,
    lang: data.lang?.trim() || 'en',
  };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function safeHref(href: string): string | null {
  const trimmed = href.trim();
  if (/^javascript:/i.test(trimmed) || /^data:/i.test(trimmed)) {
    return null;
  }
  if (/^(https?:\/\/|mailto:|\/|#)/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function renderInline(text: string): string {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_match, label: string, href: string) => {
        const safe = safeHref(href.replace(/&amp;/g, '&'));
        if (!safe) {
          return label;
        }
        const rel = safe.startsWith('http') ? ' rel="noopener noreferrer"' : '';
        const target = safe.startsWith('http') ? ' target="_blank"' : '';
        return `<a href="${escapeHtml(safe)}"${target}${rel}>${label}</a>`;
      }
    )
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

function headingId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
  return slug || 'section';
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map(cell => cell.trim());
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let index = 0;

  const peek = () => lines[index] ?? '';
  const isBlank = (line: string) => line.trim() === '';

  while (index < lines.length) {
    const line = peek();

    if (isBlank(line)) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const title = heading[2].trim();
      html.push(
        `<h${level} id="${headingId(title)}">${renderInline(title)}</h${level}>`
      );
      index += 1;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      html.push('<hr />');
      index += 1;
      continue;
    }

    if (line.trim().startsWith('<')) {
      const block: string[] = [];
      while (index < lines.length && !isBlank(peek())) {
        block.push(peek());
        index += 1;
      }
      html.push(block.join('\n'));
      continue;
    }

    if (line.trim().startsWith('>')) {
      const quotes: string[] = [];
      while (index < lines.length && peek().trim().startsWith('>')) {
        quotes.push(peek().replace(/^\s*>\s?/, ''));
        index += 1;
      }
      html.push(`<blockquote>${renderInline(quotes.join(' '))}</blockquote>`);
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1] ?? '')) {
      const headers = splitTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && peek().includes('|') && !isBlank(peek())) {
        rows.push(splitTableRow(peek()));
        index += 1;
      }
      const head = headers.map(cell => `<th>${renderInline(cell)}</th>`).join('');
      const body = rows
        .map(row => `<tr>${row.map(cell => `<td>${renderInline(cell)}</td>`).join('')}</tr>`)
        .join('');
      html.push(`<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(peek())) {
        items.push(peek().replace(/^\s*[-*]\s+/, ''));
        index += 1;
      }
      html.push(`<ul>${items.map(item => `<li>${renderInline(item)}</li>`).join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(peek())) {
        items.push(peek().replace(/^\s*\d+\.\s+/, ''));
        index += 1;
      }
      html.push(`<ol>${items.map(item => `<li>${renderInline(item)}</li>`).join('')}</ol>`);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && !isBlank(peek()) && !peek().startsWith('#')) {
      if (/^\s*[-*]\s+/.test(peek()) || /^\s*\d+\.\s+/.test(peek()) || peek().trim().startsWith('>')) {
        break;
      }
      paragraph.push(peek());
      index += 1;
    }
    html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
  }

  return html.join('\n');
}

export type FaqItem = {
  question: string;
  answer: string;
};

export function extractFaqs(html: string): FaqItem[] {
  const faqStart = html.search(/<h2 id="faq">/i);
  if (faqStart === -1) {
    return [];
  }

  const section = html.slice(faqStart);
  const faqs: FaqItem[] = [];
  const pattern = /<h3 id="[^"]*">([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(section))) {
    faqs.push({
      question: match[1].replace(/<[^>]+>/g, '').trim(),
      answer: match[2].replace(/<[^>]+>/g, '').trim(),
    });
  }

  return faqs;
}
