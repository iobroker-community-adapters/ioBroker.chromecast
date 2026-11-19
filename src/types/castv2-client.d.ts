// Minimal typings for castv2-client (CommonJS, no own typings). Only what this adapter uses.
// The classes are ES5 constructor functions; ES classes can extend them.
declare module 'castv2-client' {
    import { EventEmitter } from 'node:events';
    import type { TLSSocket } from 'node:tls';

    /** A receiver application session as reported by the device */
    export interface CastSession {
        appId: string;
        displayName?: string;
        sessionId: string;
        transportId: string;
        statusText?: string;
    }

    /** Signature that Sender.createController() uses: it calls the constructor with (client, senderId, receiverId) */
    export type ControllerFactory<T> =
        | (new (client: unknown, sourceId: string, destinationId: string) => T)
        | ((client: unknown, sourceId: string, destinationId: string) => T);

    /** An application class that the platform sender can launch or join (needs a static APP_ID) */
    export interface ApplicationClass<T> {
        new (client: unknown, session: CastSession): T;
        readonly APP_ID: string;
    }

    export class Controller extends EventEmitter {
        constructor(client: unknown, sourceId: string, destinationId: string, namespace: string, encoding?: string);
        send(data: unknown): void;
        close(): void;
    }

    export class JsonController extends Controller {
        constructor(client: unknown, sourceId: string, destinationId: string, namespace: string);
    }

    export class RequestResponseController extends JsonController {
        constructor(client: unknown, sourceId: string, destinationId: string, namespace: string);
        request(data: Record<string, unknown>, callback: (err: Error | null, response?: unknown) => void): void;
    }

    export type Callback<T = unknown> = (err: Error | null, result?: T) => void;

    export class MediaController extends RequestResponseController {
        constructor(client: unknown, sourceId: string, destinationId: string);
        getStatus(callback: Callback): void;
        play(callback?: Callback): void;
        pause(callback?: Callback): void;
        stop(callback?: Callback): void;
        seek(currentTime: number, callback?: Callback): void;
    }

    /** Base class of all applications (lib/senders/application.js); Sender itself is not exported by the package */
    export class Application extends EventEmitter {
        constructor(client: unknown, session: CastSession);
        client: unknown;
        senderId: string | null;
        receiverId: string | null;
        session: CastSession | null;
        close(): void;
        createController<T>(controller: ControllerFactory<T>): T;
    }

    /** The receiver app "Default Media Receiver" (CC1AD845): plays URLs and queues */
    export class DefaultMediaReceiver extends Application {
        static readonly APP_ID: string;
        getStatus(callback: Callback): void;
        play(callback: Callback): void;
        pause(callback: Callback): void;
        stop(callback: Callback): void;
        seek(currentTime: number, callback: Callback): void;
        queueLoad(items: unknown[], options: Record<string, unknown>, callback: Callback): void;
        queueInsert(items: unknown[], options: Record<string, unknown>, callback: Callback): void;
        queueRemove(itemIds: number[], options: Record<string, unknown>, callback: Callback): void;
        queueUpdate(items: unknown[], options: Record<string, unknown>, callback: Callback): void;
    }

    /** The connection of the castv2 package below the platform sender */
    export interface CastChannelClient extends EventEmitter {
        /** null before connect() and after the connection closed */
        socket: TLSSocket | null;
    }

    export interface ReceiverController extends EventEmitter {
        /** Stops the application with this session ID; answers the remaining applications */
        stop(sessionId: string, callback: Callback<CastSession[]>): void;
    }

    /** The platform sender (lib/senders/platform.js): the connection to the receiver of a device */
    export class Client extends EventEmitter {
        constructor();
        /** null after the connection closed (Sender.close() clears it) */
        client: CastChannelClient | null;
        receiver: ReceiverController | null;
        connect(options: { host: string; port?: number | string }, callback: () => void): void;
        close(): void;
        /** Receiver status: applications, volume, ... */
        getStatus(callback: Callback): void;
        getSessions(callback: (err: Error | null, sessions: CastSession[]) => void): void;
        join<T>(session: CastSession, app: ApplicationClass<T>, callback: (err: Error | null, app?: T) => void): void;
        launch<T>(app: ApplicationClass<T>, callback: (err: Error | null, app?: T) => void): void;
        /** `{ level: 0..1 }` or `{ muted: true }`; answers the new volume */
        setVolume(volume: { level?: number; muted?: boolean }, callback: Callback): void;
    }
}
