import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('../schema/', import.meta.url), { recursive: true });
copyFileSync(new URL('../../docs-site/api/ai-tools.json', import.meta.url), new URL('../schema/ai-tools.json', import.meta.url));
