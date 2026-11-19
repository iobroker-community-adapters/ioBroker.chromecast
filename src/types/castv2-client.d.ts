// Minimal typings for castv2-client (CommonJS, no own typings). Only what this adapter uses.
// The classes are ES5 constructor functions; ES classes can extend them.
declare module 'castv2-client' {
    import { EventEmitter } from 'node:events';

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
}
