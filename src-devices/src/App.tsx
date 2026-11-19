// Standalone dev harness for `npm run start`. It is NOT part of the federation bundle - production loads
// `Components.tsx` through Module Federation and the host supplies its own StateContext. This file only exists so the
// widget can be developed without deploying it into ioBroker.devices first:
//
//     http://localhost:3000/          against a js-controller with admin on :8081 (instance and device below)
//     http://localhost:3000/?mock     against a simulated device that plays a radio stream (no ioBroker needed)

import React, { useEffect, useState } from 'react';
import { Connection, I18n, type ThemeType } from '@iobroker/gui-components';
import type { IStateContext, ObjectChangeListener, StateChangeListener, WidgetInfo } from '@iobroker/dm-widgets';

import ChromecastPlayerComponent from './ChromecastPlayerComponent';
import translations from './translations';

// the host merges the words of `translations.ts` into its dictionary before it shows a widget
I18n.extendTranslations(translations);

/** What the harness needs of a socket: reading, subscribing and writing states, reading objects */
interface DevSocket {
    getState(id: string): Promise<ioBroker.State | null | undefined>;
    subscribeState(id: string, cb: (id: string, state: ioBroker.State | null | undefined) => void): Promise<void>;
    unsubscribeState(id: string): void;
    getObject(id: string): Promise<ioBroker.Object | null | undefined>;
    setState(id: string, val: ioBroker.StateValue, ack?: boolean): Promise<void>;
}

/**
 * Minimal IStateContext that routes getState/removeState to a socket. Fan-out per ID is handled locally so the same
 * state can have multiple subscribers.
 */
class DevStateContext implements IStateContext {
    private handlers = new Map<string, Set<StateChangeListener>>();
    private readonly socket: DevSocket;

    defaultHistory: string | null = null;
    instanceId = '';
    admin = false;
    language: ioBroker.Languages = 'en';
    longitude: number | null = null;
    latitude: number | null = null;
    isFloatComma = true;
    dateFormat = 'DD.MM.YYYY';
    imagePrefix = '../../files/';
    themeType: ThemeType = 'dark';

    constructor(socket: DevSocket) {
        this.socket = socket;
    }

    setCoordinates(latitude: number | null, longitude: number | null): void {
        this.latitude = latitude;
        this.longitude = longitude;
    }

    getImagePath(fileName: string | null | undefined): string | null {
        if (!fileName) {
            return null;
        }
        if (/^(https?:)?\/\//.test(fileName) || fileName.startsWith('data:')) {
            return fileName;
        }
        return `${this.imagePrefix}${fileName.startsWith('/') ? fileName.slice(1) : fileName}`;
    }

    getState(id: string, handler: StateChangeListener): void {
        let set = this.handlers.get(id);
        if (!set) {
            set = new Set();
            this.handlers.set(id, set);
            void this.socket.subscribeState(id, (sid, state) => {
                const listeners = this.handlers.get(sid);
                if (!listeners || !state) {
                    return;
                }
                for (const cb of listeners) {
                    cb(sid, state);
                }
            });
        }
        set.add(handler);
        void this.socket
            .getState(id)
            .then(state => {
                if (state) {
                    handler(id, state);
                }
            })
            .catch(() => {});
    }

    removeState(id: string, handler: StateChangeListener): void {
        const set = this.handlers.get(id);
        if (!set) {
            return;
        }
        set.delete(handler);
        if (set.size === 0) {
            this.socket.unsubscribeState(id);
            this.handlers.delete(id);
        }
    }

    async getObject<T>(id: string): Promise<T | undefined> {
        try {
            return ((await this.socket.getObject(id)) || undefined) as unknown as T;
        } catch {
            return undefined;
        }
    }

    // eslint-disable-next-line class-methods-use-this
    getObjectProperty(_id: string, _property: string, _cb: ObjectChangeListener): void {}
    // eslint-disable-next-line class-methods-use-this
    async removeObject(_id: string, _cb: ObjectChangeListener): Promise<void> {}

    getSocket(): Connection {
        return this.socket as unknown as Connection;
    }

    destroy(): void {
        for (const id of this.handlers.keys()) {
            this.socket.unsubscribeState(id);
        }
        this.handlers.clear();
    }
}

const MOCK_DEVICE = 'chromecast.0.mockdevice';

/**
 * A simulated Cast device for `?mock`: it plays a radio stream and reacts to play / pause / stop the way the adapter
 * does (the command is acknowledged by the next status of the device).
 */
class MockSocket implements DevSocket {
    private values: Record<string, ioBroker.StateValue> = {
        'status.connected': true,
        'status.playerState': 'playing',
        'status.displayName': 'Default Media Receiver',
        'status.text': 'Now Casting: radio',
        'metadata.title': 'A rather long title of the song that plays on the radio right now',
        'metadata.artist': 'Some Artist',
        'metadata.album': 'Radio Station',
        'metadata.cover': `data:image/svg+xml,${encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="#ff6f61"/><stop offset="1" stop-color="#6a5acd"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><circle cx="50" cy="50" r="22" fill="none" stroke="#fff" stroke-width="5"/></svg>',
        )}`,
        'player.contentId': 'http://stream.example.org/radio/live.mp3',
    };
    private listeners = new Map<string, (id: string, state: ioBroker.State) => void>();

    private static toState(val: ioBroker.StateValue): ioBroker.State {
        return { val, ack: true, ts: Date.now(), lc: Date.now(), from: 'system.adapter.mock', q: 0 };
    }

    private update(name: string, val: ioBroker.StateValue): void {
        this.values[name] = val;
        const id = `${MOCK_DEVICE}.${name}`;
        this.listeners.get(id)?.(id, MockSocket.toState(val));
    }

    getState(id: string): Promise<ioBroker.State | null> {
        const name = id.substring(MOCK_DEVICE.length + 1);
        return Promise.resolve(name in this.values ? MockSocket.toState(this.values[name]) : null);
    }

    subscribeState(id: string, cb: (id: string, state: ioBroker.State) => void): Promise<void> {
        this.listeners.set(id, cb);
        return Promise.resolve();
    }

    unsubscribeState(id: string): void {
        this.listeners.delete(id);
    }

    // eslint-disable-next-line class-methods-use-this
    getObject(id: string): Promise<ioBroker.Object | null> {
        if (id !== MOCK_DEVICE) {
            return Promise.resolve(null);
        }
        return Promise.resolve({
            _id: id,
            type: 'device',
            common: { name: 'Living_Room_speaker' },
            native: {},
        } as ioBroker.DeviceObject);
    }

    setState(id: string, _val: ioBroker.StateValue): Promise<void> {
        const name = id.substring(MOCK_DEVICE.length + 1);
        console.log(`mock: ${name} = true`);
        setTimeout(() => {
            if (name === 'player.pause') {
                this.update('status.playerState', 'paused');
            } else if (name === 'player.play' || name === 'status.playing') {
                this.update('status.playerState', 'playing');
            } else if (name === 'player.stop') {
                this.update('status.playerState', 'idle');
            }
        }, 300);
        return Promise.resolve();
    }
}

/**
 * In production the host provides the real `WidgetGeneric` via Module Federation, including `renderIndicators` /
 * `renderSettingsButton` / `getStyle*`. The compile-time stubs in `@iobroker/dm-widgets` return nothing, so the dev
 * harness fills in the few members the widget calls, to keep the standalone render from crashing.
 */
class DevPlayer extends ChromecastPlayerComponent {
    // eslint-disable-next-line class-methods-use-this
    protected renderIndicators(): React.JSX.Element | null {
        return null;
    }
    // eslint-disable-next-line class-methods-use-this
    protected renderSettingsButton(): React.JSX.Element | null {
        return null;
    }
    // eslint-disable-next-line class-methods-use-this
    protected getAccentColor(): string | undefined {
        return undefined;
    }
    // eslint-disable-next-line class-methods-use-this
    protected getWidgetClass(): string {
        return 'dev-widget';
    }
    // the host picks the size; the stub of `render()` draws nothing
    render(): React.JSX.Element {
        const size = this.props.settings.size;
        if (size === '1x1') {
            return this.renderCompact();
        }
        return size === '2x0.5' ? this.renderWide() : this.renderWideTall();
    }
}

const SIZES: Array<{ size: '1x1' | '2x0.5' | '2x2'; label: string; width: number }> = [
    { size: '1x1', label: 'Compact (1x1)', width: 190 },
    { size: '2x0.5', label: 'Wide (2x0.5)', width: 400 },
    { size: '2x2', label: 'Large (2x2)', width: 400 },
];

const overlayStyle: React.CSSProperties = {
    fontFamily: 'sans-serif',
    padding: 24,
    color: '#ddd',
};

const MOCK = new URLSearchParams(window.location.search).has('mock');

export default function App(): React.JSX.Element {
    const [ctx, setCtx] = useState<DevStateContext | null>(() => (MOCK ? new DevStateContext(new MockSocket()) : null));
    const [error, setError] = useState<string | null>(null);
    const [instance, setInstance] = useState('chromecast.0');
    const [device, setDevice] = useState(MOCK ? 'mockdevice' : '');

    useEffect(() => {
        if (MOCK) {
            return undefined;
        }
        let socket: Connection | null = null;
        try {
            socket = new Connection({
                protocol: 'ws:',
                host: window.location.hostname,
                port: 8081,
                admin5only: false,
                autoSubscribes: [],
                onReady: () => setCtx(new DevStateContext(socket as unknown as DevSocket)),
                onError: (e: unknown) => setError(String(e)),
            } as any);
        } catch (e) {
            // reported after the effect: a synchronous setState in an effect renders twice
            queueMicrotask(() => setError(String(e)));
        }
        return () => {
            socket?.destroy?.();
        };
    }, []);

    if (error) {
        return <div style={{ ...overlayStyle, color: '#ff6b6b' }}>Connection error: {error}</div>;
    }
    if (!ctx) {
        return <div style={overlayStyle}>Connecting to js-controller on :8081 …</div>;
    }

    return (
        <div style={{ ...overlayStyle, background: '#20242a', minHeight: '100vh' }}>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <label>
                    {'Instance: '}
                    <input
                        value={instance}
                        onChange={e => setInstance(e.target.value)}
                        style={{ padding: 4 }}
                    />
                </label>
                <label>
                    {'Device: '}
                    <input
                        value={device}
                        onChange={e => setDevice(e.target.value)}
                        placeholder="dce55b6815a6 or groups.<id>"
                        style={{ padding: 4 }}
                    />
                </label>
            </div>
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {SIZES.map(s => (
                    <div key={s.size}>
                        <div style={{ marginBottom: 8, fontSize: 13, opacity: 0.7 }}>{s.label}</div>
                        <div style={{ width: s.width }}>
                            <DevPlayer
                                widget={{ id: `dev_${s.size}`, type: 'widget', name: 'Cast' } as WidgetInfo}
                                stateContext={ctx}
                                settings={
                                    {
                                        size: s.size,
                                        instance,
                                        device,
                                        name: '',
                                        showCover: true,
                                    } as any
                                }
                                onHide={() => {}}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
