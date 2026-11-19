import { EventEmitter } from 'node:events';
import { Client, type ApplicationClass, type CastSession } from 'castv2-client';

import type { CastClientStatus, CastVolume } from '../types';
import type { CastLogger } from './castLogger';

const MAX_CONNECTION_RETRIES = 100;
/** The actual delay is connectionRetries * DELAY_CONNECTION_RETRY */
const DELAY_CONNECTION_RETRY = 1000;
/** Time to wait for the connection before a request fails */
const CONNECTION_TIMEOUT = 10000;

/** Where a device is reachable */
export interface CastAddress {
    name: string;
    host: string;
    port: number | string;
}

/** Keeps the connection to the receiver of one device and reconnects when it closes */
export class PersistentClient extends EventEmitter {
    readonly EVENT_CONNECTED = 'clientConnected';
    readonly EVENT_DISCONNECTED = 'clientDisconnected';
    readonly EVENT_STATUS = 'clientStatus';

    private host: string;
    private name: string;
    private port: number | string;

    /** The connected castv2-client */
    castClient: Client | undefined;
    private connectingCastClient: Client | undefined;
    private clientTimeout: NodeJS.Timeout | undefined;
    /** Removes the listener that reconnects when the device closes the connection */
    private removeCloseListener: (() => void) | undefined;

    private status: CastClientStatus | undefined;
    private previousStatus: CastClientStatus | undefined;

    constructor(
        device: CastAddress,
        private readonly log: CastLogger,
    ) {
        super();

        this.host = device.host;
        this.name = device.name;
        this.port = device.port;

        this.connectClient();
    }

    /** The scanner found the device again: reconnect if it is disconnected or its address changed */
    updateDevice(device: CastAddress): void {
        let needReconnect = false;
        if (this.castClient === undefined) {
            this.log.info(`Received keep alive for disconnected device ${device.name}`);
            needReconnect = true;
        }
        if (this.host !== device.host) {
            this.log.info(`New URL for device ${device.name}: ${device.host}`);
            this.host = device.host;
            needReconnect = true;
        }
        if (this.name !== device.name) {
            this.log.info(`New name for device: ${device.name}`);
            this.name = device.name;
            needReconnect = true;
        }
        // the JS version compared with "!=", so "8009" and 8009 are the same
        if (String(this.port) !== String(device.port)) {
            this.log.info(`New port for device ${device.name}: ${device.port}`);
            this.port = device.port;
            needReconnect = true;
        }
        if (needReconnect) {
            this.log.info(`Reconnecting ${device.name} to ${device.host}:${device.port}`);
            this.close();
            this.connectClient();
        } else {
            this.log.debug(`No need to reconnected for ${device.name}`);
        }
    }

    joinPromise<T>(session: CastSession, application: ApplicationClass<T>): Promise<T> {
        return this.getConnectedClientPromise().then(
            client =>
                new Promise<T>((resolve, reject) =>
                    client.join(session, application, (err, p) => (err ? reject(err) : resolve(p as T))),
                ),
        );
    }

    launchPromise<T>(application: ApplicationClass<T>): Promise<T> {
        return this.getConnectedClientPromise().then(
            client =>
                new Promise<T>((resolve, reject) =>
                    client.launch(application, (err, p) => (err ? reject(err) : resolve(p as T))),
                ),
        );
    }

    close(): void {
        this.closeClient();
    }

    /** Volume 0-100 */
    setVolumePromise(volume: number): Promise<number> {
        try {
            if (volume === this.getVolume()) {
                this.log.info(`${this.name} - setting volume to same value ${volume} - ignored`);
                return Promise.resolve(volume);
            }
        } catch (e) {
            this.log.info(`Failed getVolume in castv2-player persistentClient ${e}`);
        }

        return this.getConnectedClientPromise().then(client => this.setVolumeOfClient(client, { level: volume / 100 }));
    }

    mutePromise(): Promise<number> {
        return this.getConnectedClientPromise().then(client => this.setVolumeOfClient(client, { muted: true }));
    }

    unmutePromise(): Promise<number> {
        return this.getConnectedClientPromise().then(client => this.setVolumeOfClient(client, { muted: false }));
    }

    /** Volume 0-100 of the cached status (0 without status) */
    getVolume(): number {
        if (this.status) {
            // throws (like the JS version) if the status has no volume
            return PersistentClient.parseVolume(this.status.volume as CastVolume);
        }
        return 0;
    }

    getIsMuted(): boolean {
        return this.status?.volume ? this.status.volume.muted : false;
    }

    /** castv2-client emits "error"; without a listener that is an uncaught exception */
    private readonly ignoreError = (err: Error): void => {
        this.log.debug(`${this.name} - Error of a closed connection (ignored) - ${err}`);
    };

    private closeClient(): void {
        if (this.connectingCastClient) {
            this.connectingCastClient.removeAllListeners('error');
            this.connectingCastClient.on('error', this.ignoreError);
            try {
                this.connectingCastClient.close();
            } catch (e) {
                this.log.debug(`${this.name} - Error trying to close pending connection (expected) - ${e}`);
            }
            this.connectingCastClient = undefined;
        }

        // If the connection is open, try to close it
        if (this.castClient) {
            // Closed by us: do not reconnect. (castv2-player tried this with removeListener() of a new bound function on
            // the wrong object, so a disabled device connected again at once.)
            this.removeCloseListener?.();
            this.removeCloseListener = undefined;

            try {
                // We do not want to retry on the error
                this.castClient.removeAllListeners('error');
                this.castClient.on('error', this.ignoreError);

                // When the device closed the connection, castv2-client has cleaned up already and set `client` to null
                // (castv2-player read client.socket here: "Cannot read properties of null (reading 'socket')")
                if (this.castClient.client?.socket) {
                    this.castClient.close();
                }
            } catch (e) {
                this.log.error(`${this.name} - Error disconnecting - ${e}`);
            }

            // No status available (but we keep the previousStatus)
            this.status = undefined;

            this.emit(this.EVENT_DISCONNECTED);

            this.castClient = undefined;
        }

        // If we were trying to connect -> abort
        if (this.clientTimeout) {
            clearTimeout(this.clientTimeout);
        }
    }

    private connectClient(): void {
        if (this.connectingCastClient || this.castClient) {
            this.log.debug(
                `${this.name} - No need to connect. _connecting_client: ${!!this.connectingCastClient}, _client: ${!!this.castClient}`,
            );
            return;
        }

        // Try to connect - with a limit of retries
        let connectionRetries = 0;
        const launchRetry = (): void => {
            this.clientTimeout = undefined;

            connectionRetries++;
            if (connectionRetries > MAX_CONNECTION_RETRIES) {
                this.log.warn(`${this.name} - Max amount of reconnects reached - stay offline`);
                return;
            }

            const connectingClient = new Client();
            this.connectingCastClient = connectingClient;

            connectingClient.connect({ host: this.host, port: this.port }, () => {
                this.log.info(`${this.name} - Connected client`);

                // Set retries to 0 for the next try
                connectionRetries = 0;

                // Connection stable
                this.castClient = connectingClient;
                this.connectingCastClient = undefined;

                // If the device closes the connection, open it again
                const channel = connectingClient.client!;
                const onClose = (): void => {
                    this.removeCloseListener = undefined;
                    this.closeClient();
                    this.connectClient();
                };
                channel.once('close', onClose);
                this.removeCloseListener = () => channel.removeListener('close', onClose);

                // Register for status updates
                connectingClient.on('status', (status: CastClientStatus) => this.updateStatus(status));

                // Trigger a status update (without status on an error, which the player could not handle)
                connectingClient.getStatus((err, status) => {
                    if (err) {
                        this.log.warn(`${this.name} - Cannot get the status - ${err}`);
                    } else {
                        this.updateStatus(status as CastClientStatus);
                    }
                });

                this.emit(this.EVENT_CONNECTED);
            });

            connectingClient.once('error', (err: Error) => {
                this.log.warn(`${this.name} - Client error: ${err.stack}`);

                this.close();

                // Try to reconnect after some time
                this.clientTimeout = setTimeout(() => launchRetry(), connectionRetries * DELAY_CONNECTION_RETRY);
            });
        };

        launchRetry();
    }

    private updateStatus(status: CastClientStatus): void {
        // Cache the receiver status
        this.previousStatus = this.status ? JSON.parse(JSON.stringify(this.status)) : undefined;
        this.status = this.status ? Object.assign(this.status, status) : status;

        this.emit(this.EVENT_STATUS, this.status, this.previousStatus);
    }

    private getConnectedClientPromise(): Promise<Client> {
        if (this.castClient) {
            return Promise.resolve(this.castClient);
        }

        this.connectClient();

        this.log.warn(`${this.name} - Waiting up to ${CONNECTION_TIMEOUT / 1000} seconds for connection to chromecast`);

        return new Promise((resolve, reject) => {
            // castv2-player rejected with undefined (reject.bind(error) sets `this`, not the argument) and left the
            // listener behind, which later logged "Reconnected" for a request that had failed long ago
            // eslint-disable-next-line prefer-const -- the listener clears it, the timeout removes the listener
            let timeout: NodeJS.Timeout | undefined;
            const onStatus = (): void => {
                // If we receive a client status, we are connected
                clearTimeout(timeout);
                resolve(this.castClient as Client);
                this.log.warn(`${this.name} - Reconnected -> continue`);
            };
            this.once(this.EVENT_STATUS, onStatus);
            timeout = setTimeout(() => {
                this.removeListener(this.EVENT_STATUS, onStatus);
                reject(new Error('Could not connect after 10 seconds'));
            }, CONNECTION_TIMEOUT);
        });
    }

    private static parseVolume(volume: CastVolume): number {
        return Math.round(volume.level * 100);
    }

    private setVolumeOfClient(client: Client, volume: { level?: number; muted?: boolean }): Promise<number> {
        return new Promise((resolve, reject) => {
            client.setVolume(volume, (err, result) => {
                if (err) {
                    reject(err);
                    return;
                }
                const newVolume = result as CastVolume;
                if (volume.level !== undefined) {
                    this.log.info(`${this.name} - set volume to ${PersistentClient.parseVolume(newVolume)}`);
                } else {
                    this.log.info(`${this.name} - muted to ${newVolume.muted}`);
                }
                resolve(PersistentClient.parseVolume(newVolume));
            });
        });
    }
}
