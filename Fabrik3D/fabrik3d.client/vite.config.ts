import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import plugin from '@vitejs/plugin-vue';
import fs from 'fs';
import path from 'path';
import child_process from 'child_process';
import { env } from 'process';

const baseFolder =
    env.APPDATA !== undefined && env.APPDATA !== ''
        ? `${env.APPDATA}/ASP.NET/https`
        : `${env.HOME}/.aspnet/https`;

const certificateName = "fabrik3d.client";
const certFilePath = path.join(baseFolder, `${certificateName}.pem`);
const keyFilePath = path.join(baseFolder, `${certificateName}.key`);

if (!fs.existsSync(baseFolder)) {
    fs.mkdirSync(baseFolder, { recursive: true });
}

if (!fs.existsSync(certFilePath) || !fs.existsSync(keyFilePath)) {
    if (0 !== child_process.spawnSync('dotnet', [
        'dev-certs',
        'https',
        '--export-path',
        certFilePath,
        '--format',
        'Pem',
        '--no-password',
    ], { stdio: 'inherit', }).status) {
        throw new Error("Could not create certificate.");
    }
}

// ── Resolve backend target ─────────────────────────────────────────
// Priority:
//   1. VITE_ORCHESTRATOR_URL  — explicit override (always wins)
//   2. ASPNETCORE_HTTPS_PORT  — set by Kestrel tooling
//   3. ASPNETCORE_URLS        — set by Kestrel tooling
//   4. launchSettings.json    — IIS Express sslPort, then Kestrel https
//   5. hard-coded fallback
//
// A safety check ensures the resolved URL never accidentally points
// back at the Vite dev server itself.

function resolveBackendTarget(): string {
    const vitePort = parseInt(env.DEV_SERVER_PORT || '56055');

    // 1 — explicit override
    if (env.VITE_ORCHESTRATOR_URL) {
        console.log(`[proxy] using VITE_ORCHESTRATOR_URL = ${env.VITE_ORCHESTRATOR_URL}`);
        return env.VITE_ORCHESTRATOR_URL;
    }

    // 2/3 — ASP.NET env vars (set when the backend is launched by Kestrel)
    if (env.ASPNETCORE_HTTPS_PORT) {
        const port = parseInt(env.ASPNETCORE_HTTPS_PORT);
        if (port && port !== vitePort) {
            const url = `https://localhost:${port}`;
            console.log(`[proxy] using ASPNETCORE_HTTPS_PORT → ${url}`);
            return url;
        }
    }
    if (env.ASPNETCORE_URLS) {
        const url = env.ASPNETCORE_URLS.split(';')[0]!;
        if (!url.includes(`:${vitePort}`)) {
            console.log(`[proxy] using ASPNETCORE_URLS → ${url}`);
            return url;
        }
    }

    // 4 — launchSettings.json (reliable for local Visual Studio development)
    const launchSettingsPath = path.join(__dirname, '..', 'Fabrik3D.Server', 'Properties', 'launchSettings.json');
    if (fs.existsSync(launchSettingsPath)) {
        try {
            const settings = JSON.parse(fs.readFileSync(launchSettingsPath, 'utf-8'));

            // 4a — IIS Express SSL port (most common from Visual Studio)
            const iisPort: number | undefined = settings?.iisSettings?.iisExpress?.sslPort;
            if (iisPort && iisPort > 0 && iisPort !== vitePort) {
                const url = `https://localhost:${iisPort}`;
                console.log(`[proxy] using launchSettings IIS Express sslPort → ${url}`);
                return url;
            }

            // 4b — Kestrel https profile
            const kestrelUrl: string | undefined = settings?.profiles?.https?.applicationUrl;
            if (kestrelUrl) {
                const url = kestrelUrl.split(';')[0]!;
                if (!url.includes(`:${vitePort}`)) {
                    console.log(`[proxy] using launchSettings Kestrel https → ${url}`);
                    return url;
                }
            }
        } catch {
            console.warn('[proxy] failed to parse launchSettings.json');
        }
    }

    // 5 — hard-coded fallback
    const fallback = 'https://localhost:7249';
    console.log(`[proxy] using fallback → ${fallback}`);
    return fallback;
}

const target = resolveBackendTarget();

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [plugin()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    },
    server: {
        proxy: {
            '/api': {
                target,
                secure: false,
                changeOrigin: true,
            },
            '/hubs': {
                target,
                secure: false,
                ws: true,
                changeOrigin: true,
            },
        },
        port: parseInt(env.DEV_SERVER_PORT || '56055'),
        https: {
            key: fs.readFileSync(keyFilePath),
            cert: fs.readFileSync(certFilePath),
        }
    },
    optimizeDeps: {
        esbuildOptions: {
            loader: { '.js': 'ts' },
        },
    },
})
