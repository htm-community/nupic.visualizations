/* global process */

var constants = require('constants');
var path = require('path');
var nconf = require('nconf');
var fs = require('fs');
var pathToConfigs = process.env.NVIZ_CONF || '/etc/node/nviz/conf';
var configs = [];

try {
  configs = fs.readdirSync(pathToConfigs);
} catch (error) {
  console.log("No local configuration files. Using defaults.");
}

nconf.argv()
     .env();

if (configs.length > 0) {
  for (var i = configs.length - 1; i >= 0; i--) {
    if (path.extname(configs[i]) === ".json") {
      nconf.file(configs[i], path.resolve(pathToConfigs + "/" + configs[i]));
    }
  }
}
nconf.file("default", path.resolve(__dirname, 'config.json'));
nconf.defaults({                                            // these can be overridden in config files, but are not included in config.json
  "listenPort" : Number(process.env.PORT || 5000),          // this is needed for Heroku, which uses the environment variable PORT to run the app.
  "distFolder" : path.resolve(__dirname, '../client')      // allows for dynamically determining the location of directory to server the app from.
});

var http = require('http');
var logFile = fs.createWriteStream(nconf.get("expressLogFile"), {flags: 'a'}); //use {flags: 'w'} to open in write mode
var express = require('express');
var logger = require('morgan');
var errorHandler = require('errorhandler');
var pageNotFound = require('./lib/pageNotFound');
var uploadFile = require('./lib/uploadFile');
var app = express();

// if the request is for the root, we redirect to the /app path
app.use(function (req, res, next){
   if (req.url === "/") {
    res.redirect(nconf.get("appPath"));
  } else {
    next();
  }
});
var server = http.createServer(app);

app.all(nconf.get("localPath"), uploadFile()); // for streaming local files
require('./lib/routes/static').addRoutes(app); // Handles the static assets, such as images, css, etc.
require('./lib/routes/appFile').addRoutes(app); // web app

app.use(logger("combined", {stream: logFile})); // Log to express.log file

// if none of the above matches, we issue a 404
app.use(pageNotFound);

// A standard error handler - it picks up any left over errors and returns a nicely formatted server 500 error
app.use(errorHandler({ dumpExceptions: true, showStack: true }));

// Start up the server on the port specified in the config
server.listen(nconf.get("listenPort"), '0.0.0.0', 511, function() {});
console.log('NuPIC Visualizations HTTP Server - listening on port: ' + nconf.get("listenPort"));
