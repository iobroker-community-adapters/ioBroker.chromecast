// Minimal typings for youtube-remote (CommonJS, no own typings)
declare module 'youtube-remote' {
    type Callback = (err?: Error | null, result?: unknown) => void;

    class YoutubeRemote {
        constructor(screenId: string);
        playVideo(videoId: string, listId: string, callback?: Callback): void;
        addToQueue(videoId: string, callback?: Callback): void;
        playNext(videoId: string, callback?: Callback): void;
        removeVideo(videoId: string, callback?: Callback): void;
        clearPlaylist(callback?: Callback): void;
    }

    export = YoutubeRemote;
}
