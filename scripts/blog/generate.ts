import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { BlogPost } from './posts.ts';
import { renderBlogIndex, renderBlogPost, renderRobotsTxt, renderSitemap } from './render.ts';
import { isZhLang, postOutputPath } from './site.ts';

export type GeneratedFile = {
  filePath: string;
  contents: string;
};

export function buildPublicFiles(posts: BlogPost[], generatedAt = new Date().toISOString().slice(0, 10)): GeneratedFile[] {
  const enPosts = posts.filter(post => !isZhLang(post.lang));
  const zhPosts = posts.filter(post => isZhLang(post.lang));

  return [
    { filePath: 'blog/index.html', contents: renderBlogIndex(enPosts, 'en') },
    { filePath: 'zh/blog/index.html', contents: renderBlogIndex(zhPosts, 'zh') },
    ...posts.map(post => ({
      filePath: postOutputPath(post.slug, post.lang),
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
