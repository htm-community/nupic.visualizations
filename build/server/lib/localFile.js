var parse = require('csv-parse');
var fs = require('fs');
var request = require('request');
var stream = require('stream');
var byteCounter = new stream.Transform( { objectMode: true } );

module.exports = function(socket) {

  socket.emit("status", {message : "connected"});

  var Parser,
      lastByte = -1,
      fileSize = 0,
      lastChunkSize = 0,
      lastGoodByte = 0,
      totalTransforms = 0,
      totalRows = 0;

  byteCounter._transform = function (chunk, encoding, done) {
    var data = chunk.toString();
    if (this._lastLineData) {
      data = this._lastLineData + data ;
    }
    var lines = data.split('\n');
    this._lastLineData = lines.splice(lines.length-1,1)[0];
    lines.forEach(function(line) {
      lastChunkSize = line.length + 1;
      this.push(line);
    }, this);
    done();
  };

  byteCounter._flush = function (done) {
    if (this._lastLineData) {
      this.push(this._lastLineData);
      lastChunkSize = this._lastLineData + 1;
    }
    this._lastLineData = null;
    done();
  };

  function makeParser() {

    var firstRowRead = false;
    var rowLength = 0;
    var counter = 0;
    var rows = [];
    var start = 0;
    var end = 0;

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

    parser.on('readable', function(){
      var row;
      var length = 0;
      while(row = parser.read()){
        counter++;
        if (!firstRowRead) {
          rowLength = Object.keys(row).length;
          firstRowRead = true;
        }
        if (Object.keys(row).length === rowLength) {
          lastGoodByte += lastChunkSize;
          // TODO: what if the end point comes in the middle of the value of the last field?
          // We wouldn't know that it has been truncated.
          if (rows.length < 100) {
            rows.push(row);
          } else {
            sendRows();
          }
        } else {
          sendRows();
          socket.emit("status", { message : "Row length was not consistent on row " + counter + ". Expected " + rowLength + " got " + Object.keys(row).length + "." });
          parser.end(); // don't read any more
        }
      }
    });

    function sendRows() {
      socket.emit("data", {
        fileSize : fileSize,
        firstGoodByte : start,
        lastGoodByte : lastGoodByte,
        rows : rows
      });
      rows.length = 0;
    }

    // When we are done, test that the parsed output matched what expected
    parser.on('finish', function(){
      socket.emit("finish", {message : "Finished."});
    });

    parser.on('end', function(){
      socket.emit('status', {message : "End. Total rows: " + counter + "."});
      socket.emit("status", { message : "Total file length: " + fileSize + ". lastGoodByte: " + lastGoodByte });
      firstRowRead = false;
      counter = 0;
    });

    return parser;
  }

  socket.on('getFileStats', function(path) {
    fs.stat(path, function(err, stats){
      if(err) {
        socket.emit("fileRetrievalError", {
          statusCode : response.statusCode,
          statusMessage : response.statusMessage
        });
      } else {
        fileSize = stats.size;
        socket.emit('fileStats', stats);
      }
    });
  });


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
        start = message.start;
        end = message.end;
        var options = {
          start : message.start,
          end : message.end
        };
        LocalFile = fs.createReadStream(message.path, options);
        LocalFile.pipe(byteCounter).pipe(Parser);
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
