// The classes in this folder are a TypeScript port of castv2-player 2.1.3 (MIT, angelnu,
// https://github.com/iobroker-community-adapters/castv2-player, archived), which this adapter used as a dependency.

/** Logger of the Cast classes: adapter.log, or a mapping of it */
export interface CastLogger {
    error(msg: string): void;
    warn(msg: string): void;
    info(msg: string): void;
    debug(msg: string): void;
}
