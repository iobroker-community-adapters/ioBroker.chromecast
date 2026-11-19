// Augments the globally declared ioBroker types with everything this adapter adds.
// Keep in sync with `native` in io-package.json and with admin/jsonConfig.json.
import type { ManualDevice } from './types';

declare global {
    namespace ioBroker {
        interface AdapterConfig {
            /** Web instance that serves local files, e.g. "web.0" ("" = none, port 8082 is assumed) */
            web: string;
            /** IP of the web server that the Cast device uses to fetch local files */
            webServer: string;
            /** Devices added by hand (e.g. in another subnet, where mDNS does not reach) */
            manualDevices: ManualDevice[];
        }
    }
}

export {}; // needed so the file is a module
