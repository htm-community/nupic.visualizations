var parse = require('csv-parse');
var fs = require('fs');
var request = require('request');

module.exports = function(socket) {

  socket.emit("status", {message : "connected"});

  var Parser,
      lastByte = -1;

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
    Parser = makeParser();
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
          autoClose: false
        };
        LocalFile = fs.createReadStream(message.path, options);
        function readMore() {
          socket.emit("status", {message : "File has updated."});
          if (LocalFile.isPaused()) {
            socket.emit("status", {message : "Resuming..."});
            LocalFile.unpipe(Parser);
            LocalFile.resume();
            LocalFile.pipe(Parser);
          }
        }
        fs.watch(message.path, readMore);
        LocalFile.on("data", function(chunk){
          lastByte += chunk.length;
        });
        LocalFile.on("end", function(){
          LocalFile.pause();
          socket.emit("status", {message : "Got to the end of the file. " + lastByte});
        });
        LocalFile.pipe(Parser);
      }
    });
  });

  socket.on('getRemoteFile', function(message) {
    Parser = makeParser();
    socket.emit('status', { message : "Getting " + message.url });
    request.get(message.url).on("response", function(response){
      if(response.statusCode !== 200) {
        socket.emit("fileRetrievalError", {
          statusCode : response.statusCode,
          statusMessage : response.statusMessage
        });
      }
    }).pipe(Parser);
  });

};
