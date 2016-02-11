var parse = require('csv-parse');
var fs = require('fs');
var request = require('request');
var stream = require('stream');
var byteCounter = new stream.Transform({objectMode : true});

module.exports = function(socket) {

  var Parser,
      fileSize = 0,
      lastGoodByte = 0,
      totalLines = 0,
      readable = 0,
      totalRows = 0,
      sizeOfNewLine = Buffer.byteLength('\n', 'utf8');

  byteCounter._transform = function (chunk, encoding, done) {
    //chunkTracker += chunk.length;
    var data = chunk.toString('utf8');
    if (this._lastLineData) {
      data = this._lastLineData + data ;
    }
    var lines = data.split('\n');
    this._lastLineData = lines.splice(lines.length-1,1)[0];
    var textLines = "";
    lines.forEach(function(line) {
      totalLines++;
      lastGoodByte += line.length + sizeOfNewLine; // add back the length of the \n
      textLines += line + '\n';
    }, this);
    this.push(textLines);
    done();
  };

  byteCounter._flush = function (done) {
    if (this._lastLineData) {
      if (fileSize === lastGoodByte + this._lastLineData.length + sizeOfNewLine) { // only push data if it is the end of the file - otherwise it is likely to be a partial.
        lastGoodByte += this._lastLineData.length + sizeOfNewLine;
        this.push(this._lastLineData);
      }
    }
    this._lastLineData = null;
    done();
  };

  byteCounter.on('readable', function(){
    socket.emit('status', { message : "byteCounter Readable" });
  });

  byteCounter.on('error', function(err){
    socket.emit('errorMessage', { message : err.message });
  });

  byteCounter.on('finish', function(){
    socket.emit('status', { message : "byteCounter Finish" });
  });

  byteCounter.on('end', function(){
    socket.emit('status', { message : "byteCounter End" });
  });

  byteCounter.on('flush', function(){
    socket.emit('status', { message : "byteCounter Flush" });
  });

  function makeParser() {

    var rows = [];
    var start = 0;

    // Create the parser
    var parser = parse({
      delimiter: ",",
      comment: "#",
      skip_empty_lines: true,
      auto_parse: true,
      columns: true
      //encoding: 'utf-8'
    });

    // Catch any error
    parser.on('error', function(err){
      socket.emit('errorMessage', { message : err.message });
    });

    parser.on('flush', function(){
      socket.emit('status', { message : "Parser flush." });
    });

    parser.on('readable', function(){
      readable++;
      var row;
      while( null !== (row = parser.read()) ) {
        totalRows++;
        if (rows.length < 100) {
          rows.push(row);
        } else {
          sendRows();
        }
      }
    });

    function sendRows() {
      socket.emit("data", {
        fileSize : fileSize,
        firstGoodByte : start, // TODO: how to handle starting on a partial line
        lastGoodByte : lastGoodByte,
        rows : rows
      });
      rows.length = 0;
    }

    // When we are done, test that the parsed output matched what expected
    parser.on('finish', function(){
      socket.emit("finish", { message : "Parser finished." });
    });

    parser.on('end', function(){
      if (rows.length > 0) {
        sendRows();
      }
      socket.emit("status", { message : "Parser end. File size: " + fileSize + ". Total bytes: " + lastGoodByte + ". Total rows: " + totalRows});
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
        fs.createReadStream(message.path, options).pipe(byteCounter).pipe(Parser);
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
