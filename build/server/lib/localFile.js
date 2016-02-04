var parse = require('csv-parse');
var fs = require('fs');
var request = require('request');
var growingFile = require('growing-file');

module.exports = function(socket) {

  socket.emit("status", {message : "connected"});

  function makeParser() {

    // Create the parser
    var parser = parse({
      delimiter: ",",
      comment: "#",
      skip_empty_lines: true,
      auto_parse: true,
      columns: true
    });

    // Catch any error
    parser.on('error', function(err){
      socket.emit('errorMessage', { message : err.message });
    });

    // send chunks
    parser.on('data', function(row){
      socket.emit("data", row);
    });

    // When we are done, test that the parsed output matched what expected
    parser.on('finish', function(){
      socket.emit("finish", {message : "Finished"});
    });

    return parser;
  }


  // handle local files
  socket.on('getLocalFile', function(message) {
    var localParser = makeParser();
    socket.emit('status', { message : "Getting " + message.path });
    fs.access(message.path, fs.R_OK, function (err) {
      if (err) {
        var messageText;
        switch (err.errno) {
          case -2 :
            messageText = "Not found";
            break;
          case -13 :
            messageText = "Permission denied";
            break;
          default :
            messageText = "Not found";
            break;
        }
        socket.emit("fileRetrievalError", {
          statusCode : err.errno,
          statusMessage : messageText
        });
      } else {
        // read file
        var options = {
          timeout: 10000,
          interval: 100,
          startFromEnd: false
        };
        growingFile.open(message.path, options).pipe(localParser);
      }
    });
  });

  socket.on('getRemoteFile', function(message) {
    var remoteParser = makeParser();
    socket.emit('status', { message : "Getting " + message.url });
    request.get(message.url).on("response", function(response){
      if(response.statusCode !== 200) {
        socket.emit("fileRetrievalError", {
          statusCode : response.statusCode,
          statusMessage : response.statusMessage
        });
      }
    }).pipe(remoteParser);
  });

};
