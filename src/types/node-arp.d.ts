// Minimal typings for node-arp (CommonJS, no own typings)
declare module 'node-arp' {
    /**
     * Reads the MAC address of the IP from the ARP table (pings the IP first).
     *
     * Note the unusual callback: on error `err` is `true` and the second argument is the error message
     * (or the exit code of the arp command), on success `err` is `false`.
     */
    export function getMAC(ipAddress: string, callback: (err: boolean, macOrError: string | number) => void): void;
}
