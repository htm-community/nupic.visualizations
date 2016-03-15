var express = require('express');
var favicon = require('serve-favicon');
var compress = require('compression');
var nconf = require('nconf');

exports.addRoutes = function(app) {
  // Serve up the favicon
  app.use(favicon(nconf.get("distFolder") + '/favicon.ico'));
  // First looks for a static file: index.html, css, images, etc.
  app.use(nconf.get("staticUrl"), compress());
  app.use(nconf.get("staticUrl"), express.static(nconf.get("distFolder")));
  // retentionSearch portal app:
  // serve robots.txt
  app.use(function (req, res, next) {
    if ('/robots.txt' === req.url) {
        res.type('text/plain');
        res.send(nconf.get("robots"));
    } else {
        next();
    }
  });
  app.use(nconf.get("staticUrl"), function(req, res, next) {
    res.sendStatus(404); // If we get here then the request for a static file is invalid
  });
};
