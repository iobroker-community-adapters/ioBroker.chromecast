// Minimal typings for mime-types (CommonJS). Stays on 2.x like castv2-player did: 3.x resolves some extension conflicts
// differently, and the Cast devices depend on the content type.
declare module 'mime-types' {
    /** MIME type of a file name, path or URL by its extension, false if unknown */
    export function lookup(path: string): string | false;
}
