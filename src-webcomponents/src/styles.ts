/**
 * The styles of the shadow root. The element fills the box of its host, has a transparent background, inherits
 * `color` and `font` and takes everything else from the theme of the host (`--iob-*`), so it looks right in light
 * and dark. It never measures itself: the parts it shows follow the size of the box with container queries.
 *
 * `--accent` is the color of the progress, the slider and the main button: the setting of the component, else the
 * primary color of the host.
 *
 * The parts leave in this order as the box gets lower: the progress, the volume, the line with the name - and in a
 * strip the player turns into one row. In a narrow box previous / next go first.
 */
export const PLAYER_CSS = `
:host {
    display: block;
    width: 100%;
    height: 100%;
}
* {
    box-sizing: border-box;
}
.mount {
    width: 100%;
    height: 100%;
    /* the size of the box does not depend on what is in it - the parts follow it, see the container queries */
    container-type: size;
}
.view {
    --hover: color-mix(in srgb, currentColor 10%, transparent);
    --track: color-mix(in srgb, currentColor 22%, transparent);
    --pad: clamp(4px, 3cqmin, 12px);
    --gap: clamp(4px, 2.5cqmin, 10px);
    --icon: clamp(18px, 8cqmin, 26px);
    width: 100%;
    height: 100%;
    padding: var(--pad);
    display: flex;
    flex-direction: column;
    gap: var(--gap);
    overflow: hidden;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
}
.edit {
    pointer-events: none;
}
.secondary {
    color: var(--iob-text-secondary);
}
.ellipsis {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* ---- buttons and slider ---- */
button {
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    margin: 0;
    padding: calc(var(--icon) * 0.2);
    border-radius: 50%;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
}
button:hover:not(:disabled) {
    background: var(--hover);
}
button:disabled {
    cursor: default;
    opacity: 0.4;
}
button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
}
button svg {
    width: var(--icon);
    height: var(--icon);
    fill: currentColor;
    display: block;
}
button.small svg {
    width: calc(var(--icon) * 0.8);
    height: calc(var(--icon) * 0.8);
}
button.main {
    color: var(--accent);
    box-shadow: inset 0 0 0 2px var(--accent);
}
button.main svg {
    width: calc(var(--icon) * 1.25);
    height: calc(var(--icon) * 1.25);
}
input[type='range'] {
    --fill: 0%;
    /* a form control does not inherit the color; the thumb and the track are drawn in it */
    color: inherit;
    flex: 1;
    min-width: 0;
    height: 18px;
    margin: 0;
    background: transparent;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
}
input[type='range']:disabled {
    cursor: default;
    opacity: 0.4;
}
input[type='range']:focus-visible {
    outline: none;
}
input[type='range']::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(to right, var(--accent) var(--fill), var(--track) var(--fill));
}
input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    margin-top: -4px;
    border: none;
    border-radius: 50%;
    background: var(--accent);
}
input[type='range']:focus-visible::-webkit-slider-thumb {
    box-shadow: 0 0 0 4px var(--track);
}
input[type='range']::-moz-range-track {
    height: 4px;
    border-radius: 2px;
    background: var(--track);
}
input[type='range']::-moz-range-progress {
    height: 4px;
    border-radius: 2px;
    background: var(--accent);
}
input[type='range']::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border: none;
    border-radius: 50%;
    background: var(--accent);
}

/* ---- the player ---- */
.head {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    gap: calc(var(--gap) * 1.5);
}
.cover {
    height: 100%;
    max-height: 180px;
    max-width: 100%;
    aspect-ratio: 1;
    flex: none;
    border-radius: calc(var(--iob-border-radius) * 2);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--hover);
}
.cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}
.cover svg {
    width: 45%;
    height: 45%;
    fill: currentColor;
    opacity: 0.35;
}
.text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8em;
}
.dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--iob-text-secondary);
}
.dot.playing {
    background: var(--iob-success);
}
.dot.offline {
    background: var(--iob-error);
}
.title {
    font-weight: 600;
    font-size: clamp(13px, 6cqmin, 18px);
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
}
.title.muted {
    color: var(--iob-text-secondary);
    font-weight: 400;
}
.sub {
    font-size: 0.85em;
}
.seek {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.75em;
    font-variant-numeric: tabular-nums;
}
.bar {
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: var(--track);
    overflow: hidden;
}
.bar > div {
    height: 100%;
    background: var(--accent);
}
.controls {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--gap);
}
.transport {
    display: flex;
    align-items: center;
    gap: calc(var(--gap) / 2);
}
.volume {
    flex: 1 1 120px;
    max-width: 240px;
    display: flex;
    align-items: center;
    gap: 2px;
}
.offline .cover,
.offline .seek,
.offline .controls {
    opacity: 0.5;
}

/* a narrow box: previous / next go first */
@container (max-width: 279px) {
    .skip {
        display: none;
    }
}

/* a strip: one row - cover, what plays, the transport */
@container (max-height: 129px) {
    .view {
        flex-direction: row;
        align-items: center;
    }
    .head {
        height: 100%;
    }
    .seek,
    .volume {
        display: none;
    }
    .controls {
        flex-wrap: nowrap;
    }
}
@container (max-height: 69px) {
    .name,
    .sub {
        display: none;
    }
    .title {
        -webkit-line-clamp: 1;
    }
}

/* tall and narrow: the cover above, the text below it */
@container (min-height: 300px) and (orientation: portrait) {
    .head {
        flex-direction: column;
        justify-content: center;
    }
    .cover {
        max-height: none;
        flex: 1 1 0;
        min-height: 0;
        height: auto;
    }
    .text {
        flex: none;
        width: 100%;
        text-align: center;
    }
    .name {
        justify-content: center;
    }
    .controls {
        justify-content: center;
    }
}

/* ---- no device ---- */
.hint {
    width: 100%;
    height: 100%;
    padding: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    text-align: center;
    color: var(--iob-text-secondary);
    font-size: clamp(11px, 5cqmin, 15px);
}
.hint svg {
    width: clamp(18px, 10cqmin, 30px);
    height: clamp(18px, 10cqmin, 30px);
    fill: currentColor;
}
`;
