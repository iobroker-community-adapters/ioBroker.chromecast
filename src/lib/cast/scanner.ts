import mdns from 'multicast-dns';

import type { CastLogger } from './castLogger';
import type { CastTimers } from './castTimers';
import type { CastConnection } from './mediaPlayer';

export interface ScannerOptions {
    /** How often to trigger a discovery in ms. Default: every 10 minutes. 0: once, destroy after 15 seconds */
    scanInterval?: number;
    /** Only return devices with this name. Default: any device */
    name?: string;
    /** Max number of devices to find. Default: no limit */
    maxMatches?: number;
}

/** A device found via mDNS */
class Device implements CastConnection {
    private updateCallback: ((device: CastConnection) => void) | undefined;

    constructor(
        public id: string,
        public name: string,
        public host: string,
        public port: number,
        /** 'Chromecast', 'Chromecast Audio', 'Google Cast Group', ... */
        public type: string,
    ) {}

    registerForUpdates(callback: (device: CastConnection) => void): void {
        this.updateCallback = callback;
    }

    /** Calls the registered callback (the scanner saw the device again) */
    update(): void {
        this.updateCallback?.(this);
    }
}

/** Taken from https://github.com/mafintosh/dns-discovery/blob/4710835fcf83b3e8ab00ae311dcffc63fab5faf1/index.js#L709 */
function decodeTxt(bufs: Buffer[]): Record<string, string | true> {
    const data: Record<string, string | true> = {};

    for (const buf of bufs) {
        const j = buf.indexOf(61); // '='
        if (j === -1) {
            data[buf.toString()] = true;
        } else {
            data[buf.subarray(0, j).toString()] = buf.subarray(j + 1).toString();
        }
    }

    return data;
}

/** Finds the Cast devices (and speaker groups) in the network via mDNS and reports new and seen-again devices */
export class Scanner {
    private intervalHandler: ioBroker.Interval | undefined;
    private timeoutHandler: ioBroker.Timeout | undefined;
    private readonly browser = mdns({});

    /**
     * @param log Logger
     * @param timers Timers (the adapter)
     * @param onNewDevice Called once per new device; afterwards the callback that the device registered is called
     * @param options Options
     */
    constructor(
        private readonly log: CastLogger,
        private readonly timers: CastTimers,
        onNewDevice: (device: CastConnection) => void,
        options: ScannerOptions = {},
    ) {
        const scanInterval = options.scanInterval === undefined ? 600000 : options.scanInterval;

        // Remember the devices we have already found
        const foundDevices: Record<string, Device> = {};

        this.browser.on('response', (response: mdns.Packet) => {
            const txtField = response.additionals.find(entry => entry.type === 'TXT');
            const srvField = response.additionals.find(entry => entry.type === 'SRV');
            const aField = response.additionals.find(entry => entry.type === 'A');

            if (!txtField || !srvField || !aField) {
                return;
            }

            const host = aField.data as string;
            const decodedTxt = decodeTxt(txtField.data as Buffer[]);
            const name = decodedTxt.fn as string;
            // 'Chromecast', 'Chromecast Audio', 'Google Cast Group'
            const type = decodedTxt.md as string;
            const id = decodedTxt.id as string;
            const port = (srvField.data as { port: number }).port;
            if (!host || !name || !port) {
                return;
            }

            // If options.name is set, ignore the other devices
            if (options.name && options.name !== name) {
                return;
            }

            if (name in foundDevices) {
                // We have seen this device already
                const oldDevice = foundDevices[name];
                if (oldDevice.host !== host || oldDevice.port !== port) {
                    // The device has changed
                    oldDevice.host = host;
                    oldDevice.port = port;
                    this.log.debug(`updated device ${name} (${type}) at ${host}:${port}`);
                } else {
                    this.log.debug(`received keep-alive for device ${name} (${type}) at ${host}:${port}`);
                }
                oldDevice.update();
            } else {
                // First time we see this device
                foundDevices[name] = new Device(id, name, host, port, type);
                this.log.debug(`found device ${name} (${type}) at ${host}:${port}`);
                onNewDevice(foundDevices[name]);

                // Do we want more devices?
                if (options.maxMatches !== undefined && Object.keys(foundDevices).length >= options.maxMatches) {
                    this.destroy();
                }
            }
        });

        this.sendQuery();

        if (scanInterval > 0) {
            // Trigger periodic scans
            this.intervalHandler = this.timers.setInterval(() => this.sendQuery(), scanInterval);
        } else {
            // Destroy 15 seconds after we found all devices
            this.timeoutHandler = this.timers.setTimeout(() => this.destroy(), 15000);
        }
    }

    /** Sends the query to find the Cast devices */
    private sendQuery(): void {
        this.browser.query({
            questions: [{ name: '_googlecast._tcp.local', type: 'PTR' }],
        });
    }

    destroy(): void {
        this.log.info('Destroying chromecast scanner');
        this.browser.removeAllListeners('response');
        this.browser.destroy();
        if (this.intervalHandler) {
            this.timers.clearInterval(this.intervalHandler);
        }
        if (this.timeoutHandler) {
            this.timers.clearTimeout(this.timeoutHandler);
        }
    }
}
