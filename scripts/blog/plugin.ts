import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { buildPublicFiles, writePublicFiles } from './generate.ts';
import { loadPosts } from './posts.ts';
import { renderBlogIndex, renderBlogPost, renderRobotsTxt, renderSitemap } from './render.ts';

function send(res: ServerResponse, body: string, contentType: string, status = 200): void {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  res.end(body);
}

function requestPath(req: IncomingMessage): string {
  const url = req.url ?? '/';
  return url.split('?')[0] ?? '/';
}

export function blogPlugin(): Plugin {
  let rootDir = process.cwd();

  return {
    name: 'subscription-manager-blog',
    configResolved(config) {
      rootDir = config.root;
    },
    configureServer(server: ViteDevServer) {
      server.watcher.add(path.join(rootDir, 'content', 'blog'));

      server.middlewares.use((req, res, next) => {
        const url = requestPath(req);

        try {
          if (url === '/robots.txt') {
            send(res, renderRobotsTxt(), 'text/plain; charset=utf-8');
            return;
          }

          if (url === '/sitemap.xml') {
            const posts = loadPosts(rootDir);
            send(res, renderSitemap(posts), 'application/xml; charset=utf-8');
            return;
          }

          if (url === '/blog' || url === '/blog/' || url === '/blog/index.html') {
            const posts = loadPosts(rootDir);
            send(res, renderBlogIndex(posts), 'text/html; charset=utf-8');
            return;
          }

          const postMatch = url.match(/^\/blog\/([a-z0-9-]+)\/?(?:index\.html)?$/);
          if (postMatch) {
            const posts = loadPosts(rootDir);
            const post = posts.find(item => item.slug === postMatch[1]);
            if (!post) {
              send(res, 'Not found', 'text/plain; charset=utf-8', 404);
              return;
            }
            send(res, renderBlogPost(post), 'text/html; charset=utf-8');
            return;
          }
        } catch (error) {
          next(error);
          return;
        }

        next();
      });
    },
    closeBundle() {
      const posts = loadPosts(rootDir);
      const outDir = path.resolve(rootDir, 'dist');
      writePublicFiles(outDir, buildPublicFiles(posts));
    },
  };
}
