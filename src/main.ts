import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as utils from '@iobroker/adapter-core';
import type { CastLogger } from './lib/cast/castLogger';
import { MediaPlayer, type CastConnection } from './lib/cast/mediaPlayer';
import { Scanner } from './lib/cast/scanner';
import { ChromecastDevice, type ChromecastDeviceContext } from './lib/chromecastDevice';
import { COMMANDS, HELP } from './lib/help';
import type { SelectOption } from './lib/types';

/** Values of `bind` in the web instance that mean "only reachable from this host" */
const LOCALHOST_BINDS = ['localhost', '127.0.0.1', '::1'];

/** play and playSound answer {ok: true, pending: true} if the device needs longer (rule 9 of the shared catalog) */
const PENDING_MS = 15000;

/** The answer of the standard commands (shared catalog of sendTo commands) */
type StandardAnswer = Record<string, unknown>;

/** Text of an error of the Cast libraries (Error objects, strings or anything else) */
function errorText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

class ChromecastAdapter extends utils.Adapter {
    private scanner: Scanner | undefined;
    private devices: ChromecastDevice[] | undefined;
    /** Port of the configured web instance (8082 if none) */
    private webPort = 8082;
    /** Translations of the admin i18n file in the system language (for the texts the settings dialog asks for) */
    private i18n: Record<string, string> | null = null;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({ ...options, name: 'chromecast' });

        this.on('ready', () => this.onReady());
        this.on('unload', callback => this.onUnload(callback));
        this.on('message', obj => this.onMessage(obj));
    }

    private async onReady(): Promise<void> {
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

        const mediaPlayerLog: CastLogger = {
            error: msg => this.log.error(msg),
            warn: msg => this.log.warn(msg),
            // the media player is too chatty so map its info to our debug
            info: msg => this.log.debug(msg),
            debug: msg => this.log.debug(msg),
        };

        this.webPort = webPort;
        const context: ChromecastDeviceContext = {
            adapter: this,
            createMediaPlayer: connection => new MediaPlayer(connection, mediaPlayerLog, this),
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

        this.scanner = new Scanner(this.log, this, connection => {
            this.log.debug(`New connection: ${JSON.stringify(connection)}`);
            devices.push(new ChromecastDevice(context, connection, false));
        });

        // all states changes inside the adapters namespace are subscribed
        await this.subscribeStatesAsync('*');
    }

    /**
     * "help" for agents and script authors; "getPlayers", "play" and "playSound" = the standard commands of the shared
     * catalog (media.getPlayers, media.play, speech.playSound); "getWebServerIps" and "checkWebInstance" for the
     * settings dialog; "chromecast:getDevices" for the settings of the devices widget and the web component.
     * Everything else is done by writing states.
     */
    private onMessage(obj: ioBroker.Message): void {
        if (obj?.command === 'help') {
            // A description of the adapter and its states for AI agents and script authors
            if (obj.callback) {
                this.sendTo(obj.from, obj.command, { help: HELP, commands: COMMANDS }, obj.callback);
            }
        } else if (obj?.command === 'chromecast:getDevices') {
            if (obj.callback) {
                void this.getDeviceOptions()
                    .catch(e => {
                        this.log.warn(`Cannot list the devices: ${e}`);
                        return [];
                    })
                    .then(list => this.sendTo(obj.from, obj.command, list, obj.callback));
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
        } else if (obj?.command === 'getPlayers' || obj?.command === 'play' || obj?.command === 'playSound') {
            void this.onStandardCommand(obj)
                .catch((e): StandardAnswer => {
                    this.log.warn(`Cannot process "${obj.command}": ${errorText(e)}`);
                    return { error: errorText(e) };
                })
                .then(answer => {
                    // null: play / playSound answer by themselves, when the device plays
                    if (answer && obj.callback) {
                        this.sendTo(obj.from, obj.command, answer, obj.callback);
                    }
                });
        } else if (obj?.callback) {
            this.sendTo(
                obj.from,
                obj.command,
                { error: `Unknown command "${obj.command}"`, reason: 'NOT_SUPPORTED' },
                obj.callback,
            );
        }
    }

    /**
     * The standard commands media.getPlayers, media.play and speech.playSound
     *
     * @returns the answer, or null if play or playSound answers by itself (when the device plays)
     */
    private async onStandardCommand(obj: ioBroker.Message): Promise<StandardAnswer | null> {
        const msg: Record<string, unknown> =
            obj.message && typeof obj.message === 'object' ? (obj.message as Record<string, unknown>) : {};

        if (obj.command === 'getPlayers') {
            return { players: await this.getPlayers() };
        }

        let url: string | undefined;
        if (obj.command === 'playSound') {
            const source = typeof msg.url === 'string' && msg.url ? msg.url : msg.file;
            if (typeof source !== 'string' || !source) {
                return { error: 'url or file is missing', reason: 'BAD_REQUEST' };
            }
            url = this.toWebUrl(source);
            if (!url) {
                return {
                    error: 'only an http(s) URL or an iobfile:// file (with the web server in the settings) can be played',
                    reason: 'BAD_REQUEST',
                };
            }
        } else if (typeof msg.uri === 'string' && msg.uri) {
            // a URL, also YouTube; a path of a file on the host as url2play; an iobfile:// file through the web server
            url = msg.uri.startsWith('iobfile://') ? this.toWebUrl(msg.uri) : msg.uri;
            if (!url) {
                return {
                    error: 'an iobfile:// file can only be played with the web server in the settings',
                    reason: 'BAD_REQUEST',
                };
            }
        }

        const found = await this.findCastDevice(msg.device, msg.room);
        if (!(found instanceof ChromecastDevice)) {
            return found;
        }
        const device = found;
        const target = { id: device.deviceId, name: device.deviceName };
        if (!device.isEnabled) {
            return { error: `${target.name} is disabled in ioBroker`, reason: 'NOT_ALLOWED', device: target };
        }
        const connected = await this.getStateAsync(`${device.deviceId}.status.connected`);
        if (!connected?.val) {
            return { error: `${target.name} is not connected`, reason: 'NOT_CONNECTED', device: target };
        }

        let action: Promise<void>;
        if (obj.command === 'playSound') {
            const volume = Math.round(Number(msg.volume));
            action = device.playSound(url!, volume > 0 && volume <= 100 ? volume : undefined);
        } else {
            if (!url) {
                const playerState = (await this.getStateAsync(`${device.deviceId}.status.playerState`))?.val;
                if (playerState === 'playing' || playerState === 'buffering') {
                    return { ok: true, device: target };
                }
                if (playerState !== 'paused') {
                    // stopped or idle: play the last URL again, like status.playing = true
                    for (const id of ['player.contentId', 'player.url2play']) {
                        const last = (await this.getStateAsync(`${device.deviceId}.${id}`))?.val;
                        if (typeof last === 'string' && /^https?:\/\//i.test(last)) {
                            url = last;
                            break;
                        }
                    }
                    if (!url) {
                        return { error: `${target.name} has nothing to resume`, reason: 'NOT_FOUND', device: target };
                    }
                }
            }
            const position = Number(msg.positionSec);
            action = device.play(url, position > 0 ? position : undefined);
        }

        // Answer when the device plays (or the sound was played), at the latest after PENDING_MS with pending: true
        let answered = false;
        const answer = (result: StandardAnswer): void => {
            if (!answered) {
                answered = true;
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, result, obj.callback);
                }
            }
        };
        const timer = this.setTimeout(() => answer({ ok: true, pending: true, device: target }), PENDING_MS);
        action.then(
            () => {
                this.clearTimeout(timer);
                answer({ ok: true, device: target });
            },
            e => {
                this.clearTimeout(timer);
                answer({ error: `${target.name}: ${errorText(e)}`, device: target });
            },
        );
        return null;
    }

    /**
     * URL that a Cast device can fetch: an http(s) URL as it is; iobfile://<adapter>.<n>/<path> (or /<adapter>.<n>/<path>)
     * through the web server of the settings, which serves the files of ioBroker
     */
    private toWebUrl(source: string): string | undefined {
        if (/^https?:\/\//i.test(source)) {
            return source;
        }
        const file = source.startsWith('iobfile://') ? source.substring('iobfile://'.length) : source;
        if (!this.config.webServer || (source === file && !file.startsWith('/'))) {
            return undefined;
        }
        return `http://${this.config.webServer}:${this.webPort}/${file.replace(/^\/+/, '')}`;
    }

    /** The devices that can play: found in the network or added in the settings, with their ID */
    private castDevices(): ChromecastDevice[] {
        return (this.devices || []).filter(device => device.deviceId);
    }

    /** The room (enum.rooms) of every device that is a member of one (the device or one of its states) */
    private async getDeviceRooms(): Promise<Map<string, { id: string; names: string[] }>> {
        const rooms = new Map<string, { id: string; names: string[] }>();
        const enums = await this.getForeignObjectsAsync('enum.rooms.*', 'enum');
        for (const [id, room] of Object.entries(enums || {})) {
            const name = room?.common?.name;
            const names = typeof name === 'string' ? [name] : Object.values(name || {}).filter(n => n);
            for (const member of room?.common?.members || []) {
                if (member.startsWith(`${this.namespace}.`)) {
                    const deviceId = member.substring(this.namespace.length + 1);
                    for (const device of this.castDevices()) {
                        if (
                            !rooms.has(device.deviceId) &&
                            (deviceId === device.deviceId || deviceId.startsWith(`${device.deviceId}.`))
                        ) {
                            rooms.set(device.deviceId, { id, names: names.length ? names : [id] });
                        }
                    }
                }
            }
        }
        return rooms;
    }

    /** media.getPlayers: the Cast devices with name, room and whether they are connected and play something */
    private async getPlayers(): Promise<StandardAnswer[]> {
        const rooms = await this.getDeviceRooms();
        const players: StandardAnswer[] = [];
        for (const device of this.castDevices()) {
            const connected = await this.getStateAsync(`${device.deviceId}.status.connected`);
            const playerState = await this.getStateAsync(`${device.deviceId}.status.playerState`);
            const room = rooms.get(device.deviceId);
            players.push({
                id: device.deviceId,
                name: device.deviceName,
                room: room?.names[0],
                connected: !!connected?.val,
                enabled: device.isEnabled,
                active: ['playing', 'paused', 'buffering'].includes(playerState?.val as string),
            });
        }
        return players.sort((a, b) => (a.name as string).localeCompare(b.name as string));
    }

    /**
     * The device of a standard command: by its ID or name, without case, an exact name before a part of one; without a
     * device the only one (of the room, if given)
     *
     * @returns the device, or the error answer (NOT_FOUND, AMBIGUOUS with candidates)
     */
    private async findCastDevice(device: unknown, room: unknown): Promise<ChromecastDevice | StandardAnswer> {
        let devices = this.castDevices();
        if (typeof room === 'string' && room) {
            const wanted = room.toLowerCase();
            const rooms = await this.getDeviceRooms();
            devices = devices.filter(d => {
                const r = rooms.get(d.deviceId);
                return (
                    !!r &&
                    (r.id.toLowerCase() === wanted ||
                        r.id.toLowerCase() === `enum.rooms.${wanted}` ||
                        r.names.some(n => n.toLowerCase() === wanted))
                );
            });
        }
        const candidates = (list: ChromecastDevice[]): string[] => list.map(d => d.deviceName).sort();

        if (typeof device !== 'string' || !device) {
            if (devices.length === 1) {
                return devices[0];
            }
            return devices.length
                ? { error: 'Which device?', reason: 'AMBIGUOUS', candidates: candidates(devices) }
                : { error: 'No Cast device found', reason: 'NOT_FOUND', candidates: candidates(this.castDevices()) };
        }

        const wanted = device.toLowerCase();
        // the names of the objects have "_" instead of spaces and dots
        const names = (d: ChromecastDevice): string[] => [
            d.deviceName.toLowerCase(),
            d.deviceName.replace(/[.\s]+/g, '_').toLowerCase(),
        ];
        const exact = devices.filter(
            d =>
                d.deviceId.toLowerCase() === wanted ||
                `${this.namespace}.${d.deviceId}`.toLowerCase() === wanted ||
                names(d).includes(wanted),
        );
        const fitting = exact.length ? exact : devices.filter(d => names(d).some(n => n.includes(wanted)));
        if (fitting.length === 1) {
            return fitting[0];
        }
        return fitting.length
            ? { error: `"${device}" fits several devices`, reason: 'AMBIGUOUS', candidates: candidates(fitting) }
            : { error: `Unknown device "${device}"`, reason: 'NOT_FOUND', candidates: candidates(devices) };
    }

    /**
     * The Cast devices of this instance, for a `selectSendTo`: value = the device below the namespace (`dce55b6815a6`,
     * `groups.<id>`, the name of a device added by hand), label = its name
     */
    private async getDeviceOptions(): Promise<SelectOption[]> {
        const prefix = `${this.namespace}.`;
        const view = await this.getObjectViewAsync('system', 'device', {
            startkey: prefix,
            endkey: `${prefix}香`,
        });
        return view.rows
            .map(row => {
                const value = row.id.substring(prefix.length);
                const name = row.value?.common?.name;
                const label = typeof name === 'string' ? name : name?.en || value;
                return { value, label: label === value ? value : `${label} (${value})` };
            })
            .sort((a, b) => a.label.localeCompare(b.label));
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
