import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { createRequire } from 'node:module';

const { createGeminiHandler } = createRequire(import.meta.url)('./runtime/aistudio-server.cjs');
const { createAiStudioHandler } = createRequire(import.meta.url)('./runtime/ai-studio-server.cjs');
const { safePublicFetch, isSameOriginRequest } = createRequire(import.meta.url)('./runtime/safe-fetch.cjs');

function geminiServerPlugin(env: Record<string, string>): Plugin {
  const install = (server: any) => {
    const handle = createGeminiHandler({ getKey: () => env.GEMINI_API_KEY || env.GOOGLE_API_KEY || '' });
    const studioHandle = createAiStudioHandler({ getKey: () => env.GEMINI_API_KEY || env.GOOGLE_API_KEY || '' });
    server.middlewares.use((req: any, res: any, next: any) => {
      const route = req.url?.includes('/api/aistudio/') ? studioHandle : handle;
      route(req, res).then((handled: boolean) => { if (!handled) next(); }).catch(next);
    });
  };
  return { name: 'gemini-server', configureServer: install, configurePreviewServer: install };
}

// Intercept Cloud Build as early as possible to bypass memory-intensive Vite compilation
const isLocal = process.platform === 'darwin' || process.env.LOCAL_DEV === 'true';
const isCloud = !isLocal;
const isBuildCommand = process.argv.includes('build');

if (isCloud && isBuildCommand) {
  console.log('Vite Config: Cloud build environment detected. Bypassing compilation using prebuilt-dist...');
  try {
    let projectRoot = process.cwd();
    try {
      if (typeof __dirname !== 'undefined' && __dirname) {
        projectRoot = __dirname;
      }
    } catch (e) {}

    if (!fs.existsSync(path.resolve(projectRoot, 'package.json'))) {
      if (fs.existsSync(path.resolve(process.cwd(), 'package.json'))) {
        projectRoot = process.cwd();
      }
    }

    const src = path.resolve(projectRoot, 'prebuilt-dist');
    const dest = path.resolve(projectRoot, 'dist');
    if (fs.existsSync(src)) {
      if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true, force: true });
      }
      fs.cpSync(src, dest, { recursive: true });
      console.log('Vite Config: Prebuilt assets successfully copied to dist. Exiting builder process.');
      process.exit(0);
    } else {
      console.error('Vite Config: Error - prebuilt-dist folder not found!');
      process.exit(1);
    }
  } catch (err) {
    console.error('Vite Config: Failed to copy prebuilt assets:', err);
    process.exit(1);
  }
}

// 获取当前时间作为构建时间
const buildTime = new Date().toISOString().slice(0, 16).replace('T', ' ');

// Browser-like headers to avoid Google Drive robot detection (from reference: secure-artifacts/google_download)
const DRIVE_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

// 图片代理插件（解决跨域）
function imageProxyPlugin(): Plugin {
  return {
    name: 'image-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/api/') && !isSameOriginRequest(req)) {
          res.writeHead(403); res.end('Cross-origin proxy requests are not allowed'); return;
        }
        if (req.url?.startsWith('/api/')) {
          // Untrusted upstream HTML/SVG must not execute at the app's origin.
          res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'");
          res.setHeader('X-Content-Type-Options', 'nosniff');
        }
        next();
      });
      server.middlewares.use('/api/gas-proxy', async (req, res) => {
        const target = new URL(req.url || '', 'http://localhost').searchParams.get('url');
        if (!target) {
          res.writeHead(400);
          res.end('Missing url parameter');
          return;
        }

        let targetUrl: URL;
        try {
          targetUrl = new URL(target);
          const allowedHost = targetUrl.hostname === 'script.google.com'
            || targetUrl.hostname.endsWith('.script.google.com')
            || targetUrl.hostname.endsWith('.googleusercontent.com');
          if (targetUrl.protocol !== 'https:' || !allowedHost || !targetUrl.pathname.includes('/macros/')) {
            throw new Error('Unsupported GAS URL');
          }
        } catch {
          res.writeHead(400);
          res.end('Invalid GAS URL');
          return;
        }

        try {
          let body: string | undefined;
          if (req.method === 'POST') {
            body = await new Promise<string>((resolve, reject) => {
              const chunks: Buffer[] = [];
              let size = 0;
              req.on('data', chunk => {
                size += chunk.length;
                if (size > 2 * 1024 * 1024) { reject(new Error('GAS body exceeds 2 MB')); req.resume(); return; }
                chunks.push(Buffer.from(chunk));
              });
              req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
              req.on('error', reject);
            });
          }
          const response = await safePublicFetch(targetUrl, {
            method: req.method === 'POST' ? 'POST' : 'GET',
            redirect: 'follow',
            headers: req.method === 'POST' ? { 'Content-Type': 'text/plain' } : undefined,
            body,
          });
          const text = await response.text();
          res.writeHead(response.status, {
            'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          });
          res.end(text);
        } catch (err: any) {
          res.writeHead(502);
          res.end(`GAS proxy error: ${err.message}`);
        }
      });

      // ── Drive filename endpoint: scrape original filename from Drive page ──
      server.middlewares.use('/api/drive-filename', async (req, res) => {
        const fileId = new URL(req.url || '', 'http://localhost').searchParams.get('id');
        if (!fileId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing id parameter' }));
          return;
        }
        try {
          const pageUrl = `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
          const pageRes = await safePublicFetch(pageUrl, {
            headers: DRIVE_HEADERS,
            redirect: 'follow',
          });
          if (!pageRes.ok) {
            res.writeHead(pageRes.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Drive page returned ${pageRes.status}` }));
            return;
          }
          const rawBytes = Buffer.from(await pageRes.arrayBuffer());
          const html = rawBytes.toString('utf-8');

          let filename: string | null = null;

          // Priority 1: <title>
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (titleMatch) {
            filename = titleMatch[1]
              .replace(/\s*-\s*Google\s+(?:云端硬盘|Drive)\s*$/i, '')
              .trim();
          }

          // Priority 2: og:title
          if (!filename) {
            const ogMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
            if (ogMatch) {
              filename = ogMatch[1]
                .replace(/\s*-\s*Google\s+(?:云端硬盘|Drive)\s*$/i, '')
                .trim();
            }
          }

          // Priority 3: JSON "name" in page
          if (!filename) {
            const nameMatch = html.match(/"name"\s*:\s*"([^"]+)"/);
            if (nameMatch) {
              filename = nameMatch[1].replace(/\\"/g, '"').replace(/\\\//g, '/').trim();
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' });
          res.end(JSON.stringify({ filename: filename || null }));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });

      // ── Image proxy: handles CORS bypass & Google Drive confirmation pages ──
      server.middlewares.use('/api/image-proxy', async (req, res) => {
        const url = new URL(req.url || '', 'http://localhost').searchParams.get('url');
        if (!url) {
          res.writeHead(400);
          res.end('Missing url parameter');
          return;
        }
        try {
          const fetchMethod = req.method === 'HEAD' ? 'HEAD' : 'GET';
          const headers: Record<string, string> = { ...DRIVE_HEADERS };
          if (req.headers['range']) {
            headers['Range'] = req.headers['range'] as string;
          }

          let response = await safePublicFetch(url, {
            method: fetchMethod,
            headers,
            redirect: 'follow',
          });

          if (!response.ok) {
            res.writeHead(response.status);
            res.end(`Upstream error: ${response.status}`);
            return;
          }

          const upstreamCT = (response.headers.get('content-type') || '').toLowerCase();

          // ── Key technique from reference: parse Google Drive confirmation pages ──
          if (fetchMethod === 'GET' && (upstreamCT.includes('text/html') || upstreamCT.includes('application/xhtml'))) {
            const htmlText = await response.text();
            let realFileResponse: Response | null = null;

            // Strategy 1: Find <form> with action URL and submit it
            const formActionMatch = htmlText.match(/<form[^>]*action=["']([^"']+)["'][^>]*>/i);
            if (formActionMatch) {
              let actionUrl = formActionMatch[1].replace(/&amp;/g, '&');
              if (actionUrl.startsWith('/')) actionUrl = new URL(actionUrl, url).href;

              // Extract hidden input params
              const inputParams = new URLSearchParams();
              const inputRegex = /<input[^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["'][^>]*>/gi;
              let inputMatch;
              while ((inputMatch = inputRegex.exec(htmlText)) !== null) {
                inputParams.set(inputMatch[1], inputMatch[2]);
              }
              const confirmUrl = inputParams.toString() ? `${actionUrl}${actionUrl.includes('?') ? '&' : '?'}${inputParams.toString()}` : actionUrl;

              try {
                const r = await safePublicFetch(confirmUrl, { headers: DRIVE_HEADERS, redirect: 'follow' });
                const rCT = (r.headers.get('content-type') || '').toLowerCase();
                if (r.ok && !rCT.includes('text/html') && !rCT.includes('application/xhtml')) {
                  realFileResponse = r;
                }
              } catch { }
            }

            // Strategy 2: Find <a href> with download/usercontent URL
            if (!realFileResponse) {
              const linkRegex = /href=["']([^"']*(?:download|usercontent)[^"']*)["']/gi;
              let linkMatch;
              while ((linkMatch = linkRegex.exec(htmlText)) !== null) {
                let linkUrl = linkMatch[1].replace(/&amp;/g, '&');
                if (linkUrl.startsWith('/')) linkUrl = new URL(linkUrl, url).href;
                try {
                  const r = await safePublicFetch(linkUrl, { headers: DRIVE_HEADERS, redirect: 'follow' });
                  const rCT = (r.headers.get('content-type') || '').toLowerCase();
                  if (r.ok && !rCT.includes('text/html') && !rCT.includes('application/xhtml')) {
                    realFileResponse = r;
                    break;
                  }
                } catch { }
              }
            }

            // Strategy 3: Regex for drive.usercontent.google.com/download URLs in HTML
            if (!realFileResponse) {
              const urlRegex = /https?:(?:\\\/\\\/|\/\/)drive\.usercontent\.google\.com(?:\\\/|\/)+download[^\s"'<>]*/gi;
              const urlMatches = htmlText.match(urlRegex);
              if (urlMatches) {
                for (const rawUrl of urlMatches) {
                  const cleanUrl = rawUrl.replace(/\\\//g, '/').replace(/&amp;/g, '&');
                  try {
                    const r = await safePublicFetch(cleanUrl, { headers: DRIVE_HEADERS, redirect: 'follow' });
                    const rCT = (r.headers.get('content-type') || '').toLowerCase();
                    if (r.ok && !rCT.includes('text/html') && !rCT.includes('application/xhtml')) {
                      realFileResponse = r;
                      break;
                    }
                  } catch { }
                }
              }
            }

            if (realFileResponse) {
              response = realFileResponse;
            } else {
              // All strategies failed — return the HTML as-is so client can handle
              res.writeHead(200, { 'Content-Type': upstreamCT });
              res.end(htmlText);
              return;
            }
          }

          const contentType = response.headers.get('content-type') || 'application/octet-stream';
          const contentLength = response.headers.get('content-length');
          const contentDisposition = response.headers.get('content-disposition');
          const acceptRanges = response.headers.get('accept-ranges');

          const responseHeaders: Record<string, string> = {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Expose-Headers': 'Content-Disposition, Content-Type, Content-Length, Accept-Ranges',
          };
          if (contentLength) responseHeaders['Content-Length'] = contentLength;
          if (contentDisposition) responseHeaders['Content-Disposition'] = contentDisposition;
          if (acceptRanges) responseHeaders['Accept-Ranges'] = acceptRanges;

          res.writeHead(response.status || 200, responseHeaders);

          if (fetchMethod === 'HEAD' || !response.body) {
            res.end();
            return;
          }

          const { Readable } = await import('stream');
          Readable.fromWeb(response.body as any).pipe(res);
        } catch (err: any) {
          res.writeHead(500);
          res.end(`Proxy error: ${err.message}`);
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  // 读取 package.json 中的版本号
  const pkg = require('./package.json');

  return {
    base: './', // 相对路径，Electron file:// 协议需要
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react(), geminiServerPlugin(env), imageProxyPlugin()],
    define: {
      '__GOOGLE_API_PROVIDER__': JSON.stringify(env.VITE_GOOGLE_API_PROVIDER || 'gemini'),
      // AI Studio runtime secrets must never be embedded in its prebuilt client.
      'process.env.API_KEY': JSON.stringify(''),
      'process.env.GEMINI_API_KEY': JSON.stringify(''),
      '__APP_VERSION__': JSON.stringify(pkg.version),
      '__BUILD_TIME__': JSON.stringify(buildTime)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      minify: 'esbuild',
      cssCodeSplit: false,
      rollupOptions: {
        output: {
          inlineDynamicImports: true
        }
      }
    }
  };
});
