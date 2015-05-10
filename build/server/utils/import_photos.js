// Generated by CoffeeScript 1.9.0
var ALBUMS_URL, Album, PICASSA_URL, Photo, addUrlErr, async, downloadOnePhoto, errUrl, gdataClient, getTotal, https, i, im, importAlbum, importOnePhoto, importPhotos, log, numberPhotosProcessed, pass, realtimer, request, total;

request = require('request-json');

async = require('async');

https = require('https');

im = require('imagemagick-stream');

pass = require('stream').PassThrough;

log = require('printit')({
  prefix: 'photosimport'
});

gdataClient = require('gdata-js')("useless", "useless", 'http://localhost/');

realtimer = require('./realtimer');

Album = require('../models/album');

Photo = require('../models/photo');

i = 0;

errUrl = [];

addUrlErr = function(url) {
  if (errUrl.indexOf(url) > -1) {
    return errUrl.push(url);
  }
};

PICASSA_URL = "https://picasaweb.google.com/data/feed/api/";

ALBUMS_URL = PICASSA_URL + "user/default";

numberPhotosProcessed = 0;

total = 0;

getTotal = function(albums, callback) {
  return async.eachSeries(albums, function(gAlbum, next) {
    var albumFeedUrl;
    albumFeedUrl = ALBUMS_URL + "/albumid/" + gAlbum.gphoto$id.$t + "?alt=json";
    log.debug(albumFeedUrl);
    log.debug("get photos total (album length to add to total)");
    return gdataClient.getFeed(albumFeedUrl, function(err, photos) {
      total += photos.feed.entry.length;
      log.debug("photo total: " + total);
      return next();
    });
  }, callback);
};

importAlbum = function(gAlbum, done) {
  var albumToCreate;
  albumToCreate = {
    title: gAlbum.title.$t,
    description: "Imported from your google account"
  };
  log.debug("creating album " + gAlbum.title.$t);
  return Album.create(albumToCreate, function(err, cozyAlbum) {
    log.debug("created " + err);
    return importPhotos(cozyAlbum.id, gAlbum, done);
  });
};

importPhotos = function(cozyAlbumId, gAlbum, done) {
  var albumFeedUrl;
  albumFeedUrl = ALBUMS_URL + "/albumid/" + gAlbum.gphoto$id.$t + "?alt=json";
  log.debug("get photos list");
  return gdataClient.getFeed(albumFeedUrl, function(err, photos) {
    log.debug("got photos list err=" + err);
    if (err) {
      return done(err);
    }
    photos = photos.feed.entry || [];
    return async.eachSeries(photos, function(gPhoto, next) {
      return importOnePhoto(cozyAlbumId, gPhoto, function(err) {
        log.debug("done with 1 photo");
        if (err) {
          log.error(err);
        }
        realtimer.sendPhotosPhoto({
          number: ++numberPhotosProcessed,
          total: total
        });
        return next(null);
      });
    }, done);
  });
};

importOnePhoto = function(albumId, photo, done) {
  var data, name, type, url;
  url = photo.content.src;
  type = photo.content.type;
  name = photo.title.$t;
  if (type === "image/gif") {
    return done();
  }
  data = {
    title: name,
    albumid: albumId
  };
  log.debug("creating photo " + data.title);
  return Photo.create(data, function(err, cozyPhoto) {
    return downloadOnePhoto(cozyPhoto, url, type, done);
  });
};

downloadOnePhoto = function(cozyPhoto, url, type, done) {
  return https.get(url, function(stream) {
    var attach, raw, resizeScreen, resizeThumb, screen, thumb;
    stream.on('error', done);
    resizeThumb = im().resize('300x300^').crop('300x300');
    resizeScreen = im().resize('1200x800');
    raw = new pass({
      highWaterMark: 16 * 1000 * 1000
    });
    thumb = new pass({
      highWaterMark: 16 * 1000 * 1000
    });
    screen = new pass({
      highWaterMark: 16 * 1000 * 1000
    });
    stream.pipe(thumb);
    stream.pipe(screen);
    stream.pipe(raw);
    attach = function(which, stream, cb) {
      stream.path = 'useless';
      return cozyPhoto.attachBinary(stream, {
        name: which,
        type: type
      }, function(err) {
        if (err) {
          addUrlErr(url);
          log.error(which + " " + err);
        } else {
          log.debug(which + " ok");
        }
        return cb(err);
      });
    };
    return async.series([
      function(cb) {
        return attach('raw', raw, cb);
      }, function(cb) {
        var thumbStream;
        thumbStream = thumb.pipe(resizeThumb);
        return attach('thumb', thumbStream, cb);
      }, function(cb) {
        var screenStream;
        screenStream = screen.pipe(resizeScreen);
        return attach('screen', screenStream, cb);
      }
    ], done);
  });
};

module.exports = function(access_token, done) {
  gdataClient.setToken({
    access_token: access_token
  });
  log.debug("get album list");
  return gdataClient.getFeed(ALBUMS_URL, function(err, feed) {
    var numberAlbumProcessed;
    log.debug("got list err=" + err);
    numberAlbumProcessed = 0;
    numberPhotosProcessed = 0;
    total = 0;
    return getTotal(feed.feed.entry, function() {
      return async.eachSeries(feed.feed.entry, function(gAlbum, next) {
        return importAlbum(gAlbum, function(err) {
          log.debug("done with 1 album");
          if (err) {
            log.error(err);
          }
          realtimer.sendPhotosAlbum({
            number: ++numberAlbumProcessed
          });
          return next(null);
        });
      }, done);
    });
  });
};
