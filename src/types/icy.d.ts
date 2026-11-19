// Minimal typings for icy (CommonJS, no own typings)
declare module 'icy' {
    import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http';

    /**
     * The HTTP response, or (when the server sends "icy-metaint") a reader stream that strips the metadata and emits
     * "metadata"; then `res` is the HTTP response and its properties are proxied.
     */
    export type IcyResponse = IncomingMessage & { res?: IncomingMessage };

    /** http(s).get() that understands ICY (SHOUTcast) responses */
    export function get(options: RequestOptions, callback: (res: IcyResponse) => void): ClientRequest;

    /** Parses an ICY metadata block, e.g. "StreamTitle='...';" */
    export function parse(metadata: Buffer | string): Record<string, string | undefined>;
}
