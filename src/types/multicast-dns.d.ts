// Minimal typings for multicast-dns (CommonJS, no own typings). Only what the scanner uses.
declare module 'multicast-dns' {
    import type { EventEmitter } from 'node:events';

    namespace mdns {
        interface Record {
            name: string;
            /** 'A', 'AAAA', 'PTR', 'SRV', 'TXT', ... */
            type: string;
            ttl?: number;
            /** A: the IP; SRV: { port, target, priority, weight }; TXT: an array of buffers "key=value" */
            data: unknown;
        }

        interface Packet {
            answers: Record[];
            additionals: Record[];
        }

        interface Query {
            questions: { name: string; type: string }[];
        }

        interface MulticastDns extends EventEmitter {
            query(query: Query): void;
            destroy(callback?: () => void): void;
        }
    }

    function mdns(options?: { [key: string]: unknown }): mdns.MulticastDns;

    export = mdns;
}
