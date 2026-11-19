// Shapes of the data this adapter receives from the Cast devices (via lib/cast) and from its configuration

/** One row of the table "devices" in the settings */
export interface ManualDevice {
    name: string;
    host: string;
    /** A string in configurations saved by the old (HTML) settings dialog, a number since the JsonConfig */
    port: number | string;
    /** 'Chromecast', 'Chromecast Audio' or 'Google Cast Group' */
    type: string;
}

export interface CastVolume {
    /** 0..1 */
    level: number;
    muted: boolean;
}

export interface CastApplication {
    appId?: string;
    displayName?: string;
    statusText?: string;
    sessionId?: string;
    transportId?: string;
    /** Missing for the MultizoneLeader of a speaker group */
    namespaces?: { name: string }[];
}

/** Receiver status (event "clientStatus") */
export interface CastClientStatus {
    applications?: CastApplication[];
    /** HDMI devices only */
    isActiveInput?: boolean;
    /** HDMI devices only */
    isStandBy?: boolean;
    volume?: CastVolume;
}

export interface CastImage {
    url: string;
    width?: number;
    height?: number;
}

export interface CastMetadata {
    metadataType?: number;
    title?: string;
    albumName?: string;
    albumArtist?: string;
    artist?: string;
    images?: CastImage[];
    broadcastDate?: string;
    seasonNumber?: number | string;
    episodeNumber?: number | string;
    trackNumber?: number | string;
    discNumber?: number;
}

export interface CastMedia {
    contentId?: string;
    /** LIVE or BUFFERED */
    streamType?: string;
    contentType?: string;
    duration?: number;
    metadata?: CastMetadata;
}

export interface CastQueueItem {
    /** Given by the device; missing in items this adapter has not sent yet */
    itemId?: number;
    media?: CastMedia;
    autoplay?: boolean;
    /** Seconds to start at (resume after an announcement) */
    startTime?: number;
}

/**
 * Media status (event "playerStatus"), e.g.
 *
 * ```json
 * {"mediaSessionId":2, "playbackRate":1, "playerState":"PLAYING", "currentTime":51.304, "supportedMediaCommands":15,
 *  "volume":{"level":1, "muted":false},
 *  "media":{"contentId":"/library/metadata/8574", "streamType":"BUFFERED", "contentType":"music", "duration":180.271,
 *           "metadata":{"metadataType":3, "albumName":"Yellow Submarine", "title":"Sea Of Time",
 *                       "albumArtist":"The Beatles", "artist":"The Beatles", "trackNumber":8, "discNumber":1}},
 *  "currentItemId":2,
 *  "items":[{"itemId":2, "media":{...}, "autoplay":true}],
 *  "repeatMode":"REPEAT_OFF", "idleReason":null}
 * ```
 */
export interface CastPlayerStatus {
    mediaSessionId?: number;
    playbackRate?: number;
    /** PLAYING, PAUSED, BUFFERING, IDLE */
    playerState?: string;
    currentTime?: number;
    supportedMediaCommands?: number;
    volume?: CastVolume;
    media?: CastMedia;
    currentItemId?: number;
    items?: CastQueueItem[];
    /** REPEAT_OFF, REPEAT_ALL, REPEAT_SINGLE, REPEAT_ALL_AND_SHUFFLE */
    repeatMode?: string;
    shuffleMode?: string;
    idleReason?: string | null;
}

/** Answer of the message "getWebServerIps" (JsonConfig selectSendTo) */
export interface SelectOption {
    value: string;
    label: string;
}
