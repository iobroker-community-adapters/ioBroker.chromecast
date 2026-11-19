// Minimal typings for mime-types (CommonJS). 3.0.2 or newer, never 3.0.0: that one resolved `.mp4` to application/mp4,
// which a Cast device does not play as a video (fixed in 3.0.1). The content type of the result goes to the device.
declare module 'mime-types' {
    /** MIME type of a file name, path or URL by its extension, false if unknown */
    export function lookup(path: string): string | false;
}
