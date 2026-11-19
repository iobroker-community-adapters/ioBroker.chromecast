import react from '@vitejs/plugin-react';
import commonjs from 'vite-plugin-commonjs';
import { federation } from '@module-federation/vite';
import { moduleFederationShared } from '@iobroker/dm-widgets/modulefederation.devices.config.js';
import path from 'node:path';
import pack from './package.json';

// The widgets ioBroker.devices shows in its dashboard (`common.deviceWidgets` in io-package.json). The host loads
// `admin/dm-widgets/customDevices.js` through Module Federation and shares its React, MUI and gui-components.
//
// `npm run start` (Vite serve) re-routes `@iobroker/dm-widgets` to a dev wrapper, so the standalone harness
// (`index.html`, `src/App.tsx`) gets a populated MUI/React bridge. The production build resolves the real package.
const isDevServe = process.env.NODE_ENV !== 'production' && !process.argv.includes('build');

const config = {
    plugins: [
        federation({
            manifest: true,
            // Must be unique across all adapters that deliver widgets to ioBroker.devices
            name: 'DevicesWidgetChromecastSet',
            filename: 'customDevices.js',
            exposes: {
                './Components': './src/Components.tsx',
                './translations': './src/translations',
            },
            remotes: {},
            shared: moduleFederationShared(pack),
            dts: false,
        }),
        react(),
        commonjs(),
    ],
    resolve: isDevServe
        ? {
              // anchored, so that sub-path imports like `@iobroker/dm-widgets/build/index.js` are not intercepted
              alias: [
                  {
                      find: /^@iobroker\/dm-widgets$/,
                      replacement: path.resolve(__dirname, 'src/dev-dm-widgets.ts'),
                  },
              ],
              tsconfigPaths: true,
          }
        : {
              tsconfigPaths: true,
          },
    server: {
        port: 3000,
        proxy: {
            '/files': 'http://localhost:8081',
            '/adapter': 'http://localhost:8081',
            '/session': 'http://localhost:8081',
            '/log': 'http://localhost:8081',
            '/lib': 'http://localhost:8081',
        },
    },
    base: './',
    build: {
        // module federation emits top level await, which needs Chrome 89 or newer
        target: 'chrome89',
        outDir: './build',
        rollupOptions: {
            onwarn(warning: { code: string }, warn: (warning: { code: string }) => void): void {
                // Suppress "Module level directives cause errors when bundled" warnings
                if (warning.code === 'MODULE_LEVEL_DIRECTIVE') {
                    return;
                }
                warn(warning);
            },
        },
    },
};

export default config;
