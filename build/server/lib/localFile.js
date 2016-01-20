var nconf = require('nconf');
var request = require('request');
var fs = require('fs');
var zlib = require('zlib');

module.exports = function() {

  var fileHandler = function(req, res, next) {
    // let's see if we can find the file on the file system
    fs.access(req.query.filePath, fs.R_OK, function (err) {
      if (err) {
        if (err.code === "ENOENT") {
          res.sendStatus(404);
        } else {
          res.sendStatus(403); // TODO: Handle forbidden status
        }
      } else {
        fs.readFile(req.query.filePath, function(err, data){
          if (err) throw err;
          res.json(data);
        });
      }
    });
    // what if we don't have permissions?

    // is this actually a file, or a directory?

    // create a handle to the file

    // read the file

    // return the data as a stream
  };

  return fileHandler;
};
