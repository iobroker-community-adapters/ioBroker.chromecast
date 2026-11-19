/**
 * What `<iob-chromecast-player>` draws: cover, what plays, the progress, the transport and the volume of one Cast
 * device. Pure: the element passes the values and gets the commands back.
 */
import { useEffect, useRef, useState, type CSSProperties, type JSX } from 'react';

import { formatTime } from './constants';
import { Icon, type IconName } from './icons';
import type { Word } from './words';

/** What plays on the device, as the element read it from the states */
export interface PlayerValues {
    /** The name to show: the setting `title`, else the name of the device object */
    name: string;
    /** null until `status.connected` arrives */
    connected: boolean | null;
    state: 'playing' | 'paused' | 'buffering' | 'idle';
    /** The title, or the app; empty while nothing plays */
    title: string;
    subtitle: string;
    /** The URL of the cover, empty if there is none */
    cover: string;
    /** Seconds; duration 0 for a live stream */
    elapsed: number;
    duration: number;
    /** 0-100 */
    volume: number;
    muted: boolean;
}

/** The command states of the device the view writes, relative to `chromecast.<n>.<device>` */
export type PlayerCommand =
    | 'player.play'
    | 'player.pause'
    | 'player.stop'
    | 'player.next'
    | 'player.prev'
    | 'status.playing'
    | 'player.volume'
    | 'player.mute';

interface PlayerViewProps {
    values: PlayerValues;
    showCover: boolean;
    showSkip: boolean;
    showVolume: boolean;
    accent: string;
    editMode: boolean;
    word: Word;
    onCommand: (name: PlayerCommand, value: ioBroker.StateValue) => void;
}

/**
 * A slider that shows where the user drags it, and writes the value when the user lets go. The value it wrote stays
 * until the device reports it (or 2 seconds passed), so the thumb does not jump back meanwhile.
 */
function Slider({
    value,
    label,
    disabled,
    onCommit,
}: {
    value: number;
    label: string;
    disabled: boolean;
    onCommit: (value: number) => void;
}): JSX.Element {
    const [local, setLocal] = useState<number | null>(null);
    const ref = useRef<HTMLInputElement>(null);
    const commit = useRef(onCommit);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        commit.current = onCommit;
    });

    useEffect(() => {
        const input = ref.current;
        if (!input) {
            return undefined;
        }
        // `change` of the DOM fires when the user lets go (or with each key), unlike `onChange` of React
        const onChange = (): void => {
            commit.current(Number(input.value));
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setLocal(null), 2000);
        };
        input.addEventListener('change', onChange);
        return () => {
            input.removeEventListener('change', onChange);
            clearTimeout(timer.current);
        };
    }, []);

    const shown = Math.min(100, Math.max(0, local ?? value));
    return (
        <input
            ref={ref}
            type="range"
            min={0}
            max={100}
            step={1}
            value={shown}
            disabled={disabled}
            aria-label={label}
            title={`${label}: ${shown} %`}
            style={{ '--fill': `${shown}%` } as CSSProperties}
            onClick={e => e.stopPropagation()}
            onChange={e => {
                clearTimeout(timer.current);
                setLocal(Number(e.currentTarget.value));
            }}
        />
    );
}

/** The cover, or a note when there is none or it cannot be loaded */
function Cover({ url }: { url: string }): JSX.Element {
    const [broken, setBroken] = useState('');
    return (
        <div className="cover">
            {url && url !== broken ? (
                <img
                    src={url}
                    alt=""
                    draggable={false}
                    onError={() => setBroken(url)}
                />
            ) : (
                <Icon name="music" />
            )}
        </div>
    );
}

function Button({
    icon,
    label,
    className,
    disabled,
    onClick,
}: {
    icon: IconName;
    label: string;
    className?: string;
    disabled: boolean;
    onClick: () => void;
}): JSX.Element {
    return (
        <button
            type="button"
            className={className}
            title={label}
            aria-label={label}
            disabled={disabled}
            onClick={e => {
                e.stopPropagation();
                onClick();
            }}
        >
            <Icon name={icon} />
        </button>
    );
}

/** A hint instead of the player: no device chosen, or it does not exist */
export function Hint({ text, editMode }: { text: string; editMode: boolean }): JSX.Element {
    return (
        <div className={`hint${editMode ? ' edit' : ''}`}>
            <Icon name="cast" />
            <span>{text}</span>
        </div>
    );
}

export function PlayerView({
    values,
    showCover,
    showSkip,
    showVolume,
    accent,
    editMode,
    word,
    onCommand,
}: PlayerViewProps): JSX.Element {
    const { connected, state } = values;
    const playing = state === 'playing' || state === 'buffering';
    const loaded = playing || state === 'paused';
    const reachable = connected !== false && !editMode;
    const stateText = connected === false ? word('offline') : word(state);
    const dotClass = connected === false ? 'offline' : playing ? 'playing' : '';
    const progress = values.duration > 0 ? Math.min(100, (values.elapsed / values.duration) * 100) : 0;

    return (
        <div
            className={`view player${connected === false ? ' offline' : ''}${editMode ? ' edit' : ''}`}
            style={{ '--accent': accent } as CSSProperties}
        >
            <div className="head">
                {showCover ? <Cover url={loaded ? values.cover : ''} /> : null}
                <div className="text">
                    <div className="name secondary">
                        <span
                            className={`dot ${dotClass}`}
                            title={stateText}
                        />
                        <span className="ellipsis">
                            {values.name} · {stateText}
                        </span>
                    </div>
                    <div
                        className={`title${values.title ? '' : ' muted'}`}
                        title={values.title || word('nothing')}
                    >
                        {values.title || word('nothing')}
                    </div>
                    {values.subtitle ? (
                        <div
                            className="sub secondary ellipsis"
                            title={values.subtitle}
                        >
                            {values.subtitle}
                        </div>
                    ) : null}
                </div>
            </div>
            {loaded && values.duration > 0 ? (
                <div
                    className="seek secondary"
                    title={word('position')}
                >
                    <span>{formatTime(values.elapsed)}</span>
                    <div className="bar">
                        <div style={{ width: `${progress}%` }} />
                    </div>
                    <span>{formatTime(values.duration)}</span>
                </div>
            ) : null}
            <div className="controls">
                <div className="transport">
                    {showSkip ? (
                        <Button
                            icon="previous"
                            label={word('prev')}
                            className="skip small"
                            disabled={!reachable || !loaded}
                            onClick={() => onCommand('player.prev', true)}
                        />
                    ) : null}
                    {playing ? (
                        <Button
                            icon="pause"
                            label={word('pause')}
                            className="main"
                            disabled={!reachable}
                            onClick={() => onCommand('player.pause', true)}
                        />
                    ) : (
                        <Button
                            icon="play"
                            label={word('play')}
                            className="main"
                            disabled={!reachable}
                            // paused: resume; nothing loaded: play the last URL again
                            onClick={() => onCommand(state === 'paused' ? 'player.play' : 'status.playing', true)}
                        />
                    )}
                    <Button
                        icon="stop"
                        label={word('stop')}
                        disabled={!reachable || !loaded}
                        onClick={() => onCommand('player.stop', true)}
                    />
                    {showSkip ? (
                        <Button
                            icon="next"
                            label={word('next')}
                            className="skip small"
                            disabled={!reachable || !loaded}
                            onClick={() => onCommand('player.next', true)}
                        />
                    ) : null}
                </div>
                {showVolume ? (
                    <div className="volume">
                        <Button
                            icon={values.muted ? 'volumeOff' : 'volume'}
                            label={word(values.muted ? 'unmute' : 'mute')}
                            className="small"
                            disabled={!reachable}
                            onClick={() => onCommand('player.mute', !values.muted)}
                        />
                        <Slider
                            value={values.volume}
                            label={word('volume')}
                            disabled={!reachable}
                            onCommit={volume => onCommand('player.volume', volume)}
                        />
                    </div>
                ) : null}
            </div>
        </div>
    );
}
