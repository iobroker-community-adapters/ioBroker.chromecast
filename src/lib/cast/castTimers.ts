/** Timers of the Cast classes: the adapter, so that the timers are cleared when the adapter unloads */
export interface CastTimers {
    setTimeout(callback: () => void, timeout: number): ioBroker.Timeout | undefined;
    clearTimeout(timer: ioBroker.Timeout | undefined): void;
    setInterval(callback: () => void, timeout: number): ioBroker.Interval | undefined;
    clearInterval(interval: ioBroker.Interval | undefined): void;
}
