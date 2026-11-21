/*
 * The answer of the message "help": what the instance does and how it is controlled, written for an AI agent (e.g.
 * ioBroker.pi-agent, or the MCP server with send_to) and for script authors. Keep it in sync with onMessage in
 * src/main.ts and onStateChange in src/lib/chromecastDevice.ts.
 */

/**
 * The commands onMessage answers. write: true if the command has an effect; standard: the command of the shared
 * catalog of sendTo commands (family.command) that it follows
 */
export const COMMANDS: { command: string; write: boolean; standard?: string }[] = [
    { command: 'help', write: false },
    { command: 'getPlayers', write: false, standard: 'media.getPlayers' },
    { command: 'play', write: true, standard: 'media.play' },
    { command: 'playSound', write: true, standard: 'speech.playSound' },
    { command: 'chromecast:getDevices', write: false },
    { command: 'getWebServerIps', write: false },
    { command: 'checkWebInstance', write: false },
];

export const HELP = `ioBroker.chromecast: plays media on Google Cast devices in the network (Chromecast, Google Home / Nest speakers and
displays, TVs with Chromecast built-in, speaker groups) and shows what they play. An agent can play a URL (audio or
video file, internet radio, playlist, YouTube video), play an announcement and then resume, pause, stop, skip and set
the volume. Playing a URL and an announcement also works as a message with an answer; the rest is done by writing
states.

Commands (sendTo chromecast.0); getPlayers, play and playSound follow the shared catalog of sendTo commands
(media.getPlayers, media.play, speech.playSound), errors are {error, reason?} (reason NOT_FOUND or AMBIGUOUS with
candidates: [names], NOT_CONNECTED, NOT_ALLOWED = disabled, BAD_REQUEST):
- help: this text; answer {help, commands: [{command, write, standard?}]}.
- getPlayers {}: the Cast devices; answer {players: [{id, name, room?, connected, enabled, active}]}. id = <device>
  below, name = the name of the device, room = its ioBroker room, active = playing or paused.
- play {uri?, device?, room?, positionSec?}: plays uri like player.url2play (an http(s) URL of a file, stream or
  playlist, a YouTube video URL, iobfile://<adapter>.<n>/<path> or a path on the host, both only with the web server
  of the settings); positionSec = start position. Without uri it resumes (paused) or plays the last URL again.
  Answers when the device has loaded it: {ok: true, device: {id, name}}; after 15 s {ok: true, pending: true,
  device} and it goes on. device = an id or a name (without case; exact before partial), room = an ioBroker room; with
  neither the only device.
- playSound {url | file, device?, room?, volume?}: plays a short sound or speech file (url = http(s), file =
  iobfile://<adapter>.<n>/<path> through the web server of the settings) like player.announcement, then what played
  before goes on; volume 1-100 only while it plays. Answers {ok: true, device} when it was played (after 15 s
  {ok: true, pending: true}).
- chromecast:getDevices: the devices of the instance, [{value: <device>, label: "<name> (<device>)"}]; used by the
  settings of the devices widget and of the web component.
- getWebServerIps, checkWebInstance: used by the settings dialog, not needed by agents.

States (chromecast.0.<device>.*): one object of type device per Cast device; common.name = the name of the device
with spaces and dots as "_" (e.g. Living_Room_speaker). <device> = its MAC address without ":" (found in the
network), groups.<id> (speaker groups), or the name from the settings (devices added by hand). List the devices
below chromecast.0 to find them. Write the commands with ack false; the adapter writes the result with ack true when
the device reports it; errors go only to the log.
Play (each replaces what plays, except the announcement):
- player.url2play (string): an http(s) URL the device can play: a media file or stream (mp3, aac, ogg, wav, flac, mp4,
  webm, HLS, internet radio); an M3U, PLS or ASX playlist (loaded as a queue for next / prev); or a YouTube video URL
  (youtube.com/watch?v=<id>, youtu.be/<id>, music.youtube.com/watch?v=<id>: starts the YouTube app). Text without
  http = the path of a file on the ioBroker host, only if the web server is set in the settings of the adapter.
  When the device has loaded it (YouTube: the video), url2play is acknowledged with the URL.
- player.announcement (string, http(s) URL of a sound or a speech file): plays it now, then the playlist that played
  before goes on; acknowledged with the URL when done. Speech from a text: the adapter sayit (output Chromecast).
- status.playing = true: plays the last URL (player.contentId, else url2play) again; false: stops.
Control:
- player.play, player.pause, player.stop (buttons, write true): resume, pause, stop the media.
  player.paused = true / false: pause / resume.
- player.next, player.prev (buttons): next / previous item of the queue; playlist.jump (number): jump that many
  items (negative = back).
- player.volume (0-100 %): the volume of the device. player.mute (true / false).
- player.repeatMode: 0 none, 1 all, 2 one. player.shuffleMode = true: shuffle (sets repeat mode all); false: off.
- enabled: false = the adapter leaves this device alone (a setting, not for agents).
What plays (read):
- status.connected: the adapter is connected to the device. status.isStandBy, status.isActiveInput: the TV is in
  standby / shows the Chromecast input (HDMI devices only).
- status.displayName: the app that casts (e.g. Default Media Receiver, Spotify, YouTube; Backdrop = idle screen),
  status.text: its status text, status.appId.
- status.playerState: playing, paused, buffering, idle or stop. player.state: 1 play (also buffering), 0 pause, 2 stop
  (also idle). player.paused true = paused.
- metadata.title, metadata.artist, metadata.album (a radio: the station), metadata.cover (URL of the picture),
  metadata.trackNumber, metadata.episodeNumber, metadata.seasonNumber, metadata.broadcastDate: filled when the
  playing app reports them. player.contentId: the URL or ID that plays; media.contentType (e.g. audio/mpeg);
  media.streamType (LIVE or BUFFERED).
- player.currentTime, player.duration: position and length in seconds (duration 0 for live streams).
- playlist.list (JSON of the queue), playlist.currentItemId. address, port: of the device.

How to talk to the user:
- Which device: if the user names none and there is more than one device or group, ask which one; do not guess and
  do not take the one of an earlier request. Name devices by their names (without "_"), never by MAC addresses.
- What to play: the adapter cannot search. It needs a direct URL of a file or stream (or a YouTube link): ask for one
  or find the stream URL of a radio station (e.g. with a web search) and say what you picked when you play it.
- Play, stop, announce and change the volume only on the user's request; loud (volume above about 50) and
  announcements at night (about 22:00 to 07:00) only when asked.
- If status.connected is false, the device is off or not reachable: say so.
- play and playSound answer when the device plays (or an error). After writing a state read the states again (a few
  seconds later) before saying that it plays: if status.playerState stays idle or stop, the device could not play
  the URL (the log tells why).
- "What is playing": metadata.title and metadata.artist (or status.text, or the app status.displayName) on <device>,
  playing or paused, position and length as m:ss (not for live streams).`;
