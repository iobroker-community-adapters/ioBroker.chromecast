/**
 * One Cast device as a web component: `<iob-chromecast-player>`.
 *
 * One module for every host - vis-2, devices, Aura, admin (`@iobroker/web-components`). Its manifest is a file of
 * its own (`chromecast-player.json`, written by the build from `manifest.ts`), so a host loads this module only when
 * it shows the element. It shows what the device plays - cover, title, artist or the app - with the progress, and
 * offers play / pause, stop, previous / next, the volume and mute. The parts follow the size of the box.
 *
 * The element reads and writes the states of the device object the setting `device` names
 * (`chromecast.<n>.<device>`): the commands are the buttons of the adapter, written with ack false, and the result
 * comes back with the next status of the device.
 *
 * React is not in the module: it comes from `lib/esm/react-19.js` beside `adapter/`, see `vite.config.ts`.
 */
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { defineWebComponent, IobWebComponent } from '@iobroker/web-components/element';

import {
    COMPONENT,
    fileName,
    getName,
    IDLE_APPS,
    parseDeviceId,
    PLAYER_STATES,
    type PlayerSettings,
    type PlayerState,
} from './constants';
import { Hint, PlayerView, type PlayerValues } from './PlayerView';
import { PLAYER_CSS } from './styles';
import { getWords, type Word } from './words';

class ChromecastPlayer extends IobWebComponent<PlayerSettings> {
    readonly #mount: HTMLDivElement;

    #root: Root | null = null;

    /** Draws every second while a file with a length plays: the device reports the position only on changes */
    #ticker: ReturnType<typeof setInterval> | undefined;

    #words: { lang: string; word: Word } | null = null;

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = PLAYER_CSS;
        this.#mount = document.createElement('div');
        this.#mount.className = 'mount';
        shadow.append(style, this.#mount);
    }

    override disconnectedCallback(): void {
        super.disconnectedCallback();
        this.#setTicker(false);
        // a host that only moves the element connects it again in the same task: keep React then
        queueMicrotask(() => {
            if (!this.isConnected && this.#root) {
                this.#root.unmount();
                this.#root = null;
            }
        });
    }

    protected override getStateIds(settings: PlayerSettings): string[] {
        const device = parseDeviceId(settings.device);
        return device ? PLAYER_STATES.map(name => `${device}.${name}`) : [];
    }

    /** The device object, for its name and to know whether it exists */
    protected override getObjectIds(settings: PlayerSettings): string[] {
        const device = parseDeviceId(settings.device);
        return device ? [device] : [];
    }

    protected override render(): void {
        if (!this.isConnected) {
            return;
        }
        this.#root ||= createRoot(this.#mount);
        this.#root.render(this.#draw());
    }

    /** The words in the language of the system */
    get #word(): Word {
        const lang = this.systemLang;
        if (this.#words?.lang !== lang) {
            this.#words = { lang, word: getWords(lang) };
        }
        return this.#words.word;
    }

    #setTicker(on: boolean): void {
        if (on && !this.#ticker) {
            this.#ticker = setInterval(() => this.render(), 1000);
        } else if (!on && this.#ticker) {
            clearInterval(this.#ticker);
            this.#ticker = undefined;
        }
    }

    #state(device: string, name: PlayerState): ioBroker.State | null | undefined {
        return this.states[`${device}.${name}`];
    }

    #text(device: string, name: PlayerState): string {
        const val = this.#state(device, name)?.val;
        return val === null || val === undefined ? '' : String(val);
    }

    #getValues(device: string, settings: PlayerSettings): PlayerValues {
        const connectedVal = this.#state(device, 'status.connected')?.val;
        const connected = connectedVal === null || connectedVal === undefined ? null : !!connectedVal;
        const rawState = this.#text(device, 'status.playerState');
        const state: PlayerValues['state'] =
            rawState === 'playing' || rawState === 'paused' || rawState === 'buffering' ? rawState : 'idle';
        const loaded = state !== 'idle';

        // what plays: the title, and the artist and album - or the app and its status text
        const app = this.#text(device, 'status.displayName');
        const idleApp = !app || IDLE_APPS.includes(app);
        let title = '';
        let subtitle = '';
        if (loaded) {
            title =
                this.#text(device, 'metadata.title') ||
                fileName(this.#text(device, 'player.contentId')) ||
                this.#text(device, 'status.text') ||
                app;
            subtitle =
                [this.#text(device, 'metadata.artist'), this.#text(device, 'metadata.album')]
                    .filter(Boolean)
                    .join(' · ') || (idleApp || app === title ? '' : app);
        } else if (!idleApp && connected !== false) {
            // an app without media status (e.g. a video app) shows at least its name
            title = app;
            subtitle = this.#text(device, 'status.text');
        }

        // the position: the device reports it with every status, in between it goes on while playing
        const duration = Number(this.#state(device, 'player.duration')?.val) || 0;
        const currentTime = this.#state(device, 'player.currentTime');
        let elapsed = Number(currentTime?.val) || 0;
        if (state === 'playing' && currentTime) {
            // a resume writes the position again only if it changed, but always the player state
            const since = Math.max(currentTime.ts || 0, this.#state(device, 'status.playerState')?.ts || 0);
            elapsed += Math.max(0, (Date.now() - since) / 1000);
        }
        if (duration > 0) {
            elapsed = Math.min(elapsed, duration);
        }

        const object = this.objects[device];
        return {
            name:
                (typeof settings.title === 'string' && settings.title.trim()) ||
                getName(object?.common?.name, this.systemLang) ||
                device.split('.').slice(2).join('.'),
            connected,
            state,
            title,
            subtitle,
            cover: this.#text(device, 'metadata.cover'),
            elapsed,
            duration,
            volume: Number(this.#state(device, 'player.volume')?.val) || 0,
            muted: !!this.#state(device, 'player.mute')?.val,
        };
    }

    #draw(): ReactNode {
        const settings = this.settings;
        const device = parseDeviceId(settings.device);
        if (!device || this.objects[device] === null) {
            this.#setTicker(false);
            return (
                <Hint
                    text={this.#word(device ? 'notFound' : 'noDevice')}
                    editMode={this.editMode}
                />
            );
        }
        const values = this.#getValues(device, settings);
        this.#setTicker(values.state === 'playing' && values.duration > 0 && !this.editMode);
        const accent = typeof settings.accent === 'string' && settings.accent.trim();
        return (
            <PlayerView
                values={values}
                showCover={settings.showCover !== false}
                showSkip={settings.showSkip !== false}
                showVolume={settings.showVolume !== false}
                accent={accent || 'var(--iob-primary)'}
                editMode={this.editMode}
                word={this.#word}
                onCommand={(name, value) => void this.setState(`${device}.${name}`, value)}
            />
        );
    }
}

defineWebComponent(COMPONENT.tag, ChromecastPlayer);
