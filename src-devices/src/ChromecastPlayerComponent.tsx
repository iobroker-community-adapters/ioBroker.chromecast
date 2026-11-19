// Cast player widget for ioBroker.devices - one Cast device per tile.
//
// It shows what the device plays - cover, title, artist, or the app and its status text - and offers play, pause and
// stop. The states, relative to the device `chromecast.<n>.<device>`:
//
//     status.connected                 boolean  the adapter is connected to the device
//     status.playerState               string   playing, paused, buffering, idle or stop: the state to trust
//                                               (`player.state` is 1 = play also while paused, a kept quirk)
//     status.displayName               string   the app that casts (Backdrop = the idle screen)
//     status.text                      string   the status text of the app
//     metadata.title|artist|album|cover          what plays, if the app reports it
//     player.contentId                 string   the URL that plays: its file name is the title if there is no other
//     player.play|pause|stop           boolean  buttons (write true)
//     status.playing                   boolean  write true: plays the last URL again - "play" while nothing is loaded
//
// `<device>` is the MAC address without ":", `groups.<id>` or the name of a device added by hand. The settings dialog
// fills the picker with the message `chromecast:getDevices` of the instance (src/main.ts of the adapter).

import WidgetGeneric, {
    React,
    MuiMaterial,
    getTileStyles,
    isNeumorphicTheme,
    AdapterReact,
    type WidgetGenericProps,
    type WidgetGenericState,
    type CustomWidgetPlugin,
} from '@iobroker/dm-widgets';
import type { BoxProps, IconButtonProps, Theme, TypographyProps } from '@mui/material';
// `WidgetGeneric.getConfigSchema()` declares its return through dm-utils' copy of these types, so the override has to
// use the same source, while the literal is written against the richer json-config types - hence one cast.
import type { ConfigItemPanel, ConfigItemTabs } from '@iobroker/dm-utils';
import type { ConfigItemPanel as JsonConfigItemPanel } from '@iobroker/json-config';
import type { I18n as I18nType, Icon as IconType } from '@iobroker/gui-components';

import { CastIcon, MusicIcon, PauseIcon, PlayIcon, StopIcon, type SvgIconProps } from './icons';

// From the bridge of the host instead of `@mui/material`, so the widget uses the React and MUI of the host
const Box: React.ComponentType<BoxProps> = MuiMaterial?.Box;
const Typography: React.ComponentType<TypographyProps> = MuiMaterial?.Typography;
const IconButton: React.ComponentType<IconButtonProps> = MuiMaterial?.IconButton;
const I18n = AdapterReact.I18n as typeof I18nType;
const Icon = AdapterReact.Icon as typeof IconType;

/** Every state the widget subscribes, relative to the device */
const STATES = [
    'status.connected',
    'status.playerState',
    'status.displayName',
    'status.text',
    'metadata.title',
    'metadata.artist',
    'metadata.album',
    'metadata.cover',
    'player.contentId',
] as const;

type StateName = (typeof STATES)[number];

/** Apps that mean "nothing plays": the idle screen, and the media receiver without media */
const IDLE_APPS = ['Backdrop', 'Default Media Receiver'];

interface CastPlayerSettings extends CustomWidgetPlugin {
    /** chromecast adapter instance, e.g. `chromecast.0` */
    instance?: string;
    /** The device below the instance: `dce55b6815a6`, `groups.<id>`, the name of a device added by hand */
    device?: string;
    /** Show the cover of what plays */
    showCover?: boolean;
}

interface CastPlayerState extends WidgetGenericState {
    /** The latest value of every subscribed state */
    values: Partial<Record<StateName, ioBroker.StateValue>>;
    /** `common.name` of the device object; null while it is read, '' if there is none */
    deviceName: string | null;
    /** The device object does not exist (any more) */
    missing: boolean;
    /** A cover URL that did not load: the placeholder is drawn instead */
    brokenCover: string;
}

interface ButtonOptions {
    title: string;
    enabled: boolean;
    /** Drawn in the accent color: the state the device is in */
    active?: boolean;
    size: number;
}

/** The name of a common.name in the language of the user */
function translated(name: ioBroker.StringOrTranslated | undefined, lang: ioBroker.Languages): string {
    if (!name) {
        return '';
    }
    return typeof name === 'string' ? name : name[lang] || name.en || '';
}

/** The file name of an http(s) URL - the title of a stream or file without metadata */
function fileName(url: string): string {
    if (!/^https?:\/\//.test(url)) {
        return '';
    }
    try {
        const parsed = new URL(url);
        const last = parsed.pathname.split('/').filter(Boolean).pop();
        return last ? decodeURIComponent(last) : parsed.host;
    } catch {
        return '';
    }
}

export class ChromecastPlayerComponent extends WidgetGeneric<CastPlayerState, CastPlayerSettings> {
    private subscribed: { id: string; handler: (id: string, state: ioBroker.State | null | undefined) => void }[] = [];

    constructor(props: WidgetGenericProps<CastPlayerSettings>) {
        super(props);
        this.state = {
            ...this.state,
            values: {},
            deviceName: null,
            missing: false,
            brokenCover: '',
        };
    }

    static override getConfigSchema(): { name: string; schema: ConfigItemPanel | ConfigItemTabs } {
        const schema: JsonConfigItemPanel = {
            type: 'panel',
            items: {
                instance: {
                    type: 'instance',
                    adapter: 'chromecast',
                    label: 'chromecastdm_instance',
                    default: 'chromecast.0',
                    sm: 12,
                },
                device: {
                    // asks the instance for its devices, see `chromecast:getDevices` in src/main.ts of the adapter
                    type: 'selectSendTo',
                    label: 'chromecastdm_device',
                    command: 'chromecast:getDevices',
                    alsoDependsOn: ['instance'],
                    instance: '${data.instance}',
                    sm: 12,
                },
                showCover: {
                    type: 'checkbox',
                    label: 'chromecastdm_showCover',
                    default: true,
                    sm: 12,
                },
                icon: {
                    type: 'component',
                    subType: 'iconSelect',
                    label: 'chromecastdm_icon',
                    sm: 6,
                },
                name: {
                    type: 'text',
                    label: 'chromecastdm_name',
                    sm: 6,
                },
            },
        };

        return { name: 'CastPlayer', schema: schema as unknown as ConfigItemPanel };
    }

    private get instance(): string {
        return this.props.settings.instance || 'chromecast.0';
    }

    private get device(): string {
        return this.props.settings.device || '';
    }

    private stateId(name: string): string {
        return `${this.instance}.${this.device}.${name}`;
    }

    componentDidMount(): void {
        super.componentDidMount?.();
        this.subscribeStates();
        void this.readDeviceName();
    }

    componentDidUpdate(prevProps: Readonly<WidgetGenericProps<CastPlayerSettings>>): void {
        super.componentDidUpdate?.(prevProps, this.state);
        // compare the normalized values: a raw comparison of an undefined setting with the fallback of the getter
        // would differ on every update, and the setState below would update again and again
        const prevInstance = prevProps.settings.instance || 'chromecast.0';
        const prevDevice = prevProps.settings.device || '';
        if (prevInstance !== this.instance || prevDevice !== this.device) {
            this.unsubscribeStates();
            this.setState({ values: {}, deviceName: null, missing: false, brokenCover: '' }, () => {
                this.subscribeStates();
                void this.readDeviceName();
            });
        }
    }

    componentWillUnmount(): void {
        super.componentWillUnmount?.();
        this.unsubscribeStates();
    }

    /** The name of the device object (the name of the Cast device, with "_" for spaces), and whether it exists */
    private async readDeviceName(): Promise<void> {
        if (!this.device) {
            return;
        }
        const id = `${this.instance}.${this.device}`;
        try {
            const object = await this.props.stateContext.getObject<ioBroker.DeviceObject>(id);
            if (id !== `${this.instance}.${this.device}`) {
                // the settings changed meanwhile
                return;
            }
            const name = translated(object?.common?.name, this.props.stateContext.language).replace(/_/g, ' ');
            this.setState({ deviceName: name, missing: !object });
        } catch (error) {
            console.warn(`Cannot read ${id}: ${error as string}`);
        }
    }

    private subscribeStates(): void {
        if (!this.device) {
            return;
        }
        const context = this.props.stateContext;
        for (const name of STATES) {
            const id = this.stateId(name);
            const handler = (_id: string, state: ioBroker.State | null | undefined): void => {
                this.setState(prev => ({ values: { ...prev.values, [name]: state ? state.val : null } }));
            };
            context.getState(id, handler);
            this.subscribed.push({ id, handler });
        }
    }

    private unsubscribeStates(): void {
        const context = this.props.stateContext;
        for (const { id, handler } of this.subscribed) {
            context.removeState(id, handler);
        }
        this.subscribed = [];
    }

    // ---- values -------------------------------------------------------------

    private str(name: StateName): string {
        const value = this.state.values[name];
        return value === null || value === undefined ? '' : String(value);
    }

    /** null until `status.connected` arrives */
    private get connected(): boolean | null {
        const value = this.state.values['status.connected'];
        return value === null || value === undefined ? null : !!value;
    }

    private get playing(): boolean {
        const state = this.str('status.playerState');
        return state === 'playing' || state === 'buffering';
    }

    private get paused(): boolean {
        return this.str('status.playerState') === 'paused';
    }

    /** Media is loaded: it plays or is paused */
    private get loaded(): boolean {
        return this.playing || this.paused;
    }

    private get displayName(): string {
        return (
            this.props.settings.name ||
            this.state.name ||
            this.state.deviceName ||
            this.device ||
            I18n.t('chromecastdm_title')
        );
    }

    /** What plays: the title, and the artist and album - or the app and its status text */
    private nowPlaying(): { title: string; subtitle: string } {
        const app = this.str('status.displayName');
        const idleApp = !app || IDLE_APPS.includes(app);
        if (!this.loaded) {
            // an app without media status (e.g. a video app) shows at least its name
            if (!idleApp && this.connected !== false) {
                return { title: app, subtitle: this.str('status.text') };
            }
            return { title: I18n.t('chromecastdm_nothing'), subtitle: '' };
        }
        const title =
            this.str('metadata.title') || fileName(this.str('player.contentId')) || this.str('status.text') || app;
        const details = [this.str('metadata.artist'), this.str('metadata.album')].filter(Boolean).join(' · ');
        return { title, subtitle: details || (idleApp || app === title ? '' : app) };
    }

    /** The word for the state of the device */
    private stateText(): string {
        if (this.connected === false) {
            return I18n.t('chromecastdm_offline');
        }
        const state = this.str('status.playerState');
        if (state === 'playing' || state === 'paused' || state === 'buffering') {
            return I18n.t(`chromecastdm_${state}`);
        }
        return I18n.t('chromecastdm_idle');
    }

    /** The cover to draw, or '' - then no cover or the placeholder is drawn */
    private get cover(): string {
        if (this.props.settings.showCover === false || !this.loaded) {
            return '';
        }
        const cover = this.str('metadata.cover');
        const url = cover ? this.props.stateContext.getImagePath(cover) || cover : '';
        return url === this.state.brokenCover ? '' : url;
    }

    // ---- commands -----------------------------------------------------------

    /** Writes a command state of the device (ack false) */
    private send(name: string): void {
        if (this.device) {
            void this.props.stateContext.getSocket().setState(this.stateId(name), true, false);
        }
    }

    /** Paused: resume. Nothing loaded: play the last URL again (`status.playing`) */
    private onPlay = (): void => this.send(this.paused ? 'player.play' : 'status.playing');

    private onPause = (): void => this.send('player.pause');

    private onStop = (): void => this.send('player.stop');

    // ---- WidgetGeneric override points --------------------------------------

    protected isTileActive(): boolean {
        return this.playing;
    }

    protected renderTileIcon(): React.JSX.Element | null {
        const customIcon = this.playing
            ? this.props.settings?.iconActive || this.props.settings?.icon
            : this.props.settings?.icon;
        if (customIcon) {
            return (
                <Icon
                    src={customIcon}
                    style={{ width: 22, height: 22, flex: '0 0 auto' }}
                />
            );
        }
        return (
            <CastIcon
                size={22}
                style={{ opacity: 0.85 }}
            />
        );
    }

    // ---- parts --------------------------------------------------------------

    private static renderButton(
        IconComponent: (props: SvgIconProps) => React.JSX.Element,
        onClick: () => void,
        options: ButtonOptions,
    ): React.JSX.Element {
        const { title, enabled, active, size } = options;
        return (
            <IconButton
                title={title}
                aria-label={title}
                disabled={!enabled}
                onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    onClick();
                }}
                sx={(theme: Theme) => ({
                    width: size,
                    height: size,
                    padding: 0,
                    flex: '0 0 auto',
                    color: active ? theme.palette.primary.contrastText : 'inherit',
                    backgroundColor: active ? theme.palette.primary.main : 'rgba(128, 128, 128, 0.16)',
                    '&:hover': {
                        backgroundColor: active ? theme.palette.primary.dark : 'rgba(128, 128, 128, 0.3)',
                    },
                    // the button of the state the device is in is disabled, but shown in full
                    '&.Mui-disabled': {
                        color: active ? theme.palette.primary.contrastText : 'inherit',
                        opacity: active ? 1 : 0.35,
                        backgroundColor: active ? theme.palette.primary.main : 'rgba(128, 128, 128, 0.16)',
                    },
                })}
            >
                <IconComponent size={Math.round(size * 0.58)} />
            </IconButton>
        );
    }

    /** Play, pause, stop */
    private renderTransport(size: number): React.JSX.Element {
        const reachable = this.connected !== false && !!this.device;
        return (
            <Box
                sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, flex: '0 0 auto' }}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
                {ChromecastPlayerComponent.renderButton(PlayIcon, this.onPlay, {
                    title: I18n.t('chromecastdm_play'),
                    enabled: reachable && !this.playing,
                    active: this.playing,
                    size,
                })}
                {ChromecastPlayerComponent.renderButton(PauseIcon, this.onPause, {
                    title: I18n.t('chromecastdm_pause'),
                    enabled: reachable && this.playing,
                    active: this.paused,
                    size,
                })}
                {ChromecastPlayerComponent.renderButton(StopIcon, this.onStop, {
                    title: I18n.t('chromecastdm_stop'),
                    enabled: reachable && this.loaded,
                    size,
                })}
            </Box>
        );
    }

    /** Green: connected and playing, grey: connected, red: not connected */
    private renderDot(): React.JSX.Element {
        const connected = this.connected;
        return (
            <Box
                component="span"
                title={this.stateText()}
                sx={{
                    flex: '0 0 auto',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: connected === false ? '#c0392b' : this.playing ? '#3fbf5f' : '#8a929a',
                }}
            />
        );
    }

    /** Icon, name and the state dot */
    private renderHeader(): React.JSX.Element {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, width: '100%', minWidth: 0 }}>
                {this.renderTileIcon()}
                <Typography
                    variant="body2"
                    sx={{
                        flex: 1,
                        minWidth: 0,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        lineHeight: 1.25,
                    }}
                >
                    {this.displayName}
                </Typography>
                {this.renderDot()}
            </Box>
        );
    }

    /** The cover, or a placeholder if it is wanted but there is none */
    private renderCover(size: number | string, placeholder: boolean): React.JSX.Element | null {
        const cover = this.cover;
        if (!cover && !placeholder) {
            return null;
        }
        return (
            <Box
                sx={{
                    width: size,
                    height: size,
                    maxWidth: '100%',
                    maxHeight: '100%',
                    aspectRatio: '1',
                    flex: '0 0 auto',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(128, 128, 128, 0.16)',
                }}
            >
                {cover ? (
                    <img
                        src={cover}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={() => this.setState({ brokenCover: cover })}
                    />
                ) : (
                    <MusicIcon
                        size="45%"
                        style={{ opacity: 0.4 }}
                    />
                )}
            </Box>
        );
    }

    /** Title and subtitle; the hint instead while no device is chosen or it does not exist */
    private renderNowPlaying(titleLines: number, align: 'left' | 'center'): React.JSX.Element {
        let title: string;
        let subtitle: string;
        if (!this.device) {
            title = I18n.t('chromecastdm_noDevice');
            subtitle = '';
        } else if (this.state.missing) {
            title = I18n.t('chromecastdm_notFound');
            subtitle = this.device;
        } else {
            ({ title, subtitle } = this.nowPlaying());
        }
        const muted = !this.device || this.state.missing || (!this.loaded && this.connected !== true);
        return (
            <Box sx={{ minWidth: 0, width: '100%', textAlign: align }}>
                <Typography
                    variant="body2"
                    title={title}
                    sx={{
                        fontWeight: 600,
                        lineHeight: 1.3,
                        opacity: muted ? 0.6 : 1,
                        display: '-webkit-box',
                        WebkitLineClamp: titleLines,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        wordBreak: 'break-word',
                    }}
                >
                    {title}
                </Typography>
                {subtitle ? (
                    <Typography
                        variant="caption"
                        component="div"
                        title={subtitle}
                        sx={{ opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                        {subtitle}
                    </Typography>
                ) : null}
            </Box>
        );
    }

    /** The frame of every size: the tile styles of the host and its indicators */
    private renderFrame(
        outerStyle: (theme: Theme) => React.CSSProperties,
        inner: (theme: Theme) => Record<string, unknown>,
        content: React.JSX.Element,
    ): React.JSX.Element {
        const isActive = this.isTileActive();
        const accent = this.getAccentColor();
        const indicators = this.renderIndicators(this.renderSettingsButton());
        return (
            <Box
                id={String(this.props.widget.id)}
                className={this.getWidgetClass()}
                sx={outerStyle}
            >
                <Box
                    sx={(theme: Theme) => ({
                        boxSizing: 'border-box',
                        width: '100%',
                        overflow: 'hidden',
                        ...(getTileStyles(theme, isActive, accent) as Record<string, unknown>),
                        ...inner(theme),
                    })}
                >
                    <div
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        style={{ display: 'contents' }}
                    >
                        {indicators}
                    </div>
                    {content}
                </Box>
            </Box>
        );
    }

    // ---- sizes --------------------------------------------------------------

    /** 1x1: name, what plays and the three buttons */
    renderCompact(): React.JSX.Element {
        const cover = this.cover;
        return this.renderFrame(
            theme => WidgetGeneric.getStyleCompact(theme),
            theme => ({
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '6px',
                aspectRatio: '1',
                minHeight: 0,
                padding: isNeumorphicTheme(theme) ? '6px' : '8px',
            }),
            <>
                {this.renderHeader()}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minHeight: 0, width: '100%' }}>
                    {cover ? this.renderCover(40, false) : null}
                    {this.renderNowPlaying(cover ? 3 : 2, 'left')}
                </Box>
                {this.renderTransport(34)}
            </>,
        );
    }

    /** 2x0.5: one strip - cover, name and what plays, the buttons */
    renderWide(): React.JSX.Element {
        return this.renderFrame(
            theme => WidgetGeneric.getStyleWide(theme),
            theme => ({
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                padding: isNeumorphicTheme(theme) ? '6px' : '8px',
            }),
            <>
                {this.props.settings.showCover !== false ? this.renderCover(48, true) : this.renderTileIcon()}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                        variant="caption"
                        component="div"
                        sx={{ opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                        {this.displayName} · {this.stateText()}
                    </Typography>
                    {this.renderNowPlaying(1, 'left')}
                </Box>
                {this.renderTransport(34)}
            </>,
        );
    }

    /** 2x1 / 2x2: a large cover, what plays and the buttons */
    renderWideTall(): React.JSX.Element {
        const showCover = this.props.settings.showCover !== false;
        return this.renderFrame(
            theme => WidgetGeneric.getStyleWideTall(theme),
            theme => ({
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                height: '100%',
                padding: isNeumorphicTheme(theme) ? '8px' : '12px',
            }),
            <>
                {this.renderHeader()}
                {showCover ? (
                    <Box
                        sx={{
                            flex: 1,
                            minHeight: 0,
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {this.renderCover('100%', true)}
                    </Box>
                ) : (
                    <Box sx={{ flex: 1 }} />
                )}
                {this.renderNowPlaying(2, 'center')}
                {this.renderTransport(44)}
            </>,
        );
    }
}

export default ChromecastPlayerComponent;
