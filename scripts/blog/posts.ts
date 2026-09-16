import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  extractFaqs,
  markdownToHtml,
  parseFrontmatter,
  toFrontmatter,
  type BlogFrontmatter,
  type FaqItem,
} from './markdown.ts';

export type BlogPost = BlogFrontmatter & {
  bodyHtml: string;
  faqs: FaqItem[];
  sourcePath: string;
};

export function contentDir(rootDir: string): string {
  return path.join(rootDir, 'content', 'blog');
}

export function loadPosts(rootDir: string): BlogPost[] {
  const directory = contentDir(rootDir);
  const files = readdirSync(directory)
    .filter(name => name.endsWith('.md'))
    .sort();

  const posts = files.map(fileName => {
    const sourcePath = path.join(directory, fileName);
    const raw = readFileSync(sourcePath, 'utf8');
    const { data, body } = parseFrontmatter(raw);
    const frontmatter = toFrontmatter(data);
    const expectedFile = `${frontmatter.slug}.md`;

    if (fileName !== expectedFile) {
      throw new Error(
        `Post file "${fileName}" must be named "${expectedFile}" to match its slug`
      );
    }

    const bodyHtml = markdownToHtml(body);
    return {
      ...frontmatter,
      bodyHtml,
      faqs: extractFaqs(bodyHtml),
      sourcePath,
    };
  });

  return posts.sort((left, right) => {
    if (left.date === right.date) {
      return left.title.localeCompare(right.title);
    }
    return right.date.localeCompare(left.date);
  });
}
