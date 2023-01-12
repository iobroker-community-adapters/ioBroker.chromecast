// Shamelessly copied from https://github.com/alxhotel/chromecast-api

const Castv2Client = require('castv2-client')
const Application = Castv2Client.Application
const MediaController = Castv2Client.MediaController
const YoutubeController = require('./YoutubeController')

const YOUTUBE_REGEX = /(?:http(?:s?):\/\/)?(?:www\.)?(?:music\.)?youtu(?:be\.com\/watch\?v=|\.be\/)([\w\-\_]*)(&(amp;)?‌​[\w\?‌​=]*)?/
const URI_REGEX = /\w+:(\/?\/?)[^\s]+/
const PATH_REGEX = /(\\\\?([^\\/]*[\\/])*)([^\\/]+)/

class Youtube extends Application {
  constructor(client, session) {
    super(client, session)

    this.media = this.createController(MediaController)
    this.youtube = this.createController(YoutubeController)

    const self = this

    this.media.on('status', function (status) {
      self.emit('status', status)
    })
  }

  static get APP_ID() { return '233637DE' }

  static getYoutubeId(obj) {
    if (!obj || typeof obj !== 'string') return null

    const youtubeMatch = obj.match(YOUTUBE_REGEX)
    const uriMatch = obj.match(URI_REGEX)
    const pathMatch = obj.match(PATH_REGEX)

    if (youtubeMatch && youtubeMatch.length > 1) {
      // Extract the video id
      return youtubeMatch[1]
    } else if ((uriMatch && uriMatch.length > 1) || (pathMatch && pathMatch.length > 1)) {
      // URI or path to file
      return null
    } else {
      // Looks like a possible video id (lets try)
      return obj
    }
  }

  getStatus(callback) {
    this.media.getStatus.apply(this.media, arguments)
  }

  load(videoId) {
    this.youtube.load.apply(this.youtube, arguments)
  }

  play(callback) {
    this.media.play.apply(this.media, arguments)
  }

  pause(callback) {
    this.media.pause.apply(this.media, arguments)
  }

  stop(callback) {
    this.media.stop.apply(this.media, arguments)
  }

  seek(currentTime, callback) {
    this.media.seek.apply(this.media, arguments)
  }
}

module.exports = Youtube
