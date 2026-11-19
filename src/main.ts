import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as utils from '@iobroker/adapter-core';
import { LogWrapper, MediaPlayer, Scanner, type CastConnection, type CastScanner } from 'castv2-player';

import { ChromecastDevice, type ChromecastDeviceContext } from './lib/chromecastDevice';
import { COMMANDS, HELP } from './lib/help';
import type { SelectOption } from './lib/types';

/** Values of `bind` in the web instance that mean "only reachable from this host" */
const LOCALHOST_BINDS = ['localhost', '127.0.0.1', '::1'];

class ChromecastAdapter extends utils.Adapter {
    private scanner: CastScanner | undefined;
    private devices: ChromecastDevice[] | undefined;
    /** Translations of the admin i18n file in the system language (for the texts the settings dialog asks for) */
    private i18n: Record<string, string> | null = null;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({ ...options, name: 'chromecast' });

        this.on('ready', () => this.onReady());
        this.on('unload', callback => this.onUnload(callback));
        this.on('message', obj => this.onMessage(obj));
    }

    private async onReady(): Promise<void> {
        const ScannerClass = Scanner(new LogWrapper(this.log));

        let webPort = 8082;
        if (this.config.web) {
            try {
                const webObj = await this.getForeignObjectAsync(`system.adapter.${this.config.web}`);
                if (!webObj) {
                    throw new Error(`Instance "${this.config.web}" not found`);
                }
                webPort = webObj.native.port;
            } catch (e) {
                this.log.error(`Cannot get web port: ${e.toString()}`);
                webPort = 8082;
            }
        }

        const context: ChromecastDeviceContext = {
            adapter: this,
            MediaPlayer: MediaPlayer(
                new LogWrapper({
                    error: (msg: string) => this.log.error(msg),
                    warn: (msg: string) => this.log.warn(msg),
                    // castv2-player is too chatty so map its info to our debug
                    info: (msg: string) => this.log.debug(msg),
                    debug: (msg: string) => this.log.debug(msg),
                }),
            ),
            webPort,
            knownDeviceIds: [],
        };

        const devices: ChromecastDevice[] = [];
        this.devices = devices;

        // Create manually added devices (if any)
        if (this.config.manualDevices) {
            for (let i = 0; i < this.config.manualDevices.length; i++) {
                const device = this.config.manualDevices[i];
                const connection: CastConnection = {
                    ...device,
                    // Emulate ID
                    id: `${i}-${device.name}`,
                    // Emulate registerForUpdates
                    registerForUpdates: () => {},
                };

                devices.push(new ChromecastDevice(context, connection, true));
            }
        }

        this.scanner = new ScannerClass(connection => {
            this.log.debug(`New connection: ${JSON.stringify(connection)}`);
            devices.push(new ChromecastDevice(context, connection, false));
        });

        // all states changes inside the adapters namespace are subscribed
        await this.subscribeStatesAsync('*');
    }

    /**
     * "help" for agents and script authors; "getWebServerIps" and "checkWebInstance" for the settings dialog.
     * Everything else is done by writing states.
     */
    private onMessage(obj: ioBroker.Message): void {
        if (obj?.command === 'help') {
            // A description of the adapter and its states for AI agents and script authors
            if (obj.callback) {
                this.sendTo(obj.from, obj.command, { help: HELP, commands: COMMANDS }, obj.callback);
            }
        } else if (obj?.command === 'getWebServerIps') {
            if (obj.callback) {
                void this.getWebServerIps(obj.message)
                    .catch(e => {
                        this.log.warn(`Cannot read the IPs of the web server: ${e}`);
                        return [];
                    })
                    .then(list => this.sendTo(obj.from, obj.command, list, obj.callback));
            }
        } else if (obj?.command === 'checkWebInstance') {
            if (obj.callback) {
                void this.checkWebInstance(obj.message)
                    .catch(e => {
                        this.log.warn(`Cannot check the web instance: ${e}`);
                        return '';
                    })
                    .then(text =>
                        this.sendTo(
                            obj.from,
                            obj.command,
                            { text, style: text ? { color: '#ff9800' } : undefined },
                            obj.callback,
                        ),
                    );
            }
        }
    }

    /** The web instance the settings dialog asks about: `{ web: "web.0" }` */
    private static getWebFromMessage(message: ioBroker.MessagePayload): string {
        if (message && typeof message === 'object' && typeof (message as { web?: unknown }).web === 'string') {
            return (message as { web: string }).web;
        }
        return '';
    }

    /**
     * IPs that the Cast devices can use to reach the web instance: all external IPv4 (bind 0.0.0.0) or IPv6 (bind ::)
     * addresses of its host, or the one address the web instance is bound to.
     */
    private async getWebServerIps(message: ioBroker.MessagePayload): Promise<SelectOption[]> {
        const web = ChromecastAdapter.getWebFromMessage(message);
        if (!web) {
            return [];
        }
        const webObj = await this.getForeignObjectAsync(`system.adapter.${web}`);
        if (!webObj) {
            return [];
        }
        const bind: string | undefined = webObj.native.bind;
        if (bind === '0.0.0.0' || bind === '::') {
            const family = bind === '0.0.0.0' ? 'IPv4' : 'IPv6';
            const hostObj = await this.getForeignObjectAsync(
                `system.host.${(webObj.common as ioBroker.InstanceCommon).host}`,
            );
            const interfaces = hostObj?.native?.hardware?.networkInterfaces;
            const result: SelectOption[] = [];
            for (const [iface, addresses] of Object.entries(interfaces || {})) {
                for (const address of addresses || []) {
                    if (address.family === family && !address.internal) {
                        result.push({ value: address.address, label: `[${family}] ${address.address} - ${iface}` });
                    }
                }
            }
            return result;
        }

        return bind ? [{ value: bind, label: bind }] : [];
    }

    /** Warnings about a web instance that the Cast devices cannot use */
    private async checkWebInstance(message: ioBroker.MessagePayload): Promise<string> {
        const web = ChromecastAdapter.getWebFromMessage(message);
        if (!web) {
            return '';
        }
        const webObj = await this.getForeignObjectAsync(`system.adapter.${web}`);
        if (!webObj) {
            return '';
        }
        const warnings: string[] = [];
        if (webObj.native.auth) {
            warnings.push(await this.translate('Cannot use web server with authentication'));
        }
        if (LOCALHOST_BINDS.includes(webObj.native.bind)) {
            warnings.push(await this.translate('Cannot use web server only on localhost'));
        }
        return warnings.join('. ');
    }

    /** Translates a text of the settings dialog with admin/i18n/<system language>.json */
    private async translate(text: string): Promise<string> {
        if (!this.i18n) {
            const systemConfig = await this.getForeignObjectAsync('system.config');
            const language = systemConfig?.common?.language || 'en';
            try {
                // __dirname is build/, the admin folder is next to it
                this.i18n = JSON.parse(
                    readFileSync(join(__dirname, '..', 'admin', 'i18n', `${language}.json`), 'utf8'),
                );
            } catch {
                this.i18n = {};
            }
        }
        return this.i18n![text] || text;
    }

    private onUnload(callback: () => void): void {
        try {
            this.scanner?.destroy();
            this.devices?.forEach(device => device.destroy());
            this.devices = undefined;
        } catch (error) {
            console.error(error);
        }

        callback();
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new ChromecastAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new ChromecastAdapter())();
}
