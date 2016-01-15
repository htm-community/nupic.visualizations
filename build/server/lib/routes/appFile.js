var nconf = require('nconf');

exports.addRoutes = function(app) {
  var appPath = new RegExp(nconf.get("appPath")+"(?=$|[/])"); // this RegEx will match /appPath and /appPath/ and /appPath/*
  // This route enables HTML5Mode by forwarding missing files to the index.html
  app.all(appPath, function (req, res) {
    // Just send the index.html for other files to support HTML5Mode
    res.sendFile('index.html', { root: nconf.get("distFolder") });
  });
};
