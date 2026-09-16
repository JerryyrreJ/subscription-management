import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { BlogPost } from './posts.ts';
import { renderBlogIndex, renderBlogPost, renderRobotsTxt, renderSitemap } from './render.ts';

export type GeneratedFile = {
  filePath: string;
  contents: string;
};

export function buildPublicFiles(posts: BlogPost[], generatedAt = new Date().toISOString().slice(0, 10)): GeneratedFile[] {
  return [
    { filePath: 'blog/index.html', contents: renderBlogIndex(posts) },
    ...posts.map(post => ({
      filePath: `blog/${post.slug}/index.html`,
      contents: renderBlogPost(post),
    })),
    { filePath: 'sitemap.xml', contents: renderSitemap(posts, generatedAt) },
    { filePath: 'robots.txt', contents: renderRobotsTxt() },
  ];
}

export function writePublicFiles(outDir: string, files: GeneratedFile[]): void {
  for (const file of files) {
    const destination = path.join(outDir, file.filePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, file.contents);
  }
}
