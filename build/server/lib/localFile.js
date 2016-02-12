var parse = require('csv-parse');
var fs = require('fs');
var request = require('request');
var stream = require('stream');

module.exports = function(socket) {

  var sizeOfNewLine = Buffer.byteLength('\n', 'utf8');
  /*
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
  */

  // handle local files
  socket.on('readLocalFile', function(message) {

    var fileSize = 0,
        lastGoodByte = message.start,
        firstGoodByte = message.start,
        columns = (message.columns) ? message.columns : true;

    // get stats on the file
    fs.stat(message.path, function(err, stats){
      if(err) {
        socket.emit("fileRetrievalError", {
          statusCode : response.statusCode,
          statusMessage : response.statusMessage
        });
      } else {
        fileSize = stats.size;
        getFile();
      }
    });

    function getFile() {

      var rows = [],
          firstChunk = false;

      function sendRows() {
        columns = Object.keys(rows[0]);
        socket.emit("data", {
          fileSize : fileSize,
          firstGoodByte : firstGoodByte, // TODO: how to handle starting on a partial line
          lastGoodByte : lastGoodByte,
          rows : rows,
          columns : columns
        });
        rows.length = 0;
      }

      // we need to create a counter that will count the byte position
      // of the stream at the last good row. This is because when picking an arbitrary
      // position in the file, we will most likely be choosing a position somewhere in
      // the middle of a line. So, we want to save the position of the last line so when
      // we ask for more data, we can read from that point.
      byteCounter = new stream.Transform({objectMode : true});

      byteCounter._transform = function (chunk, encoding, done) {
        var data = chunk.toString('utf8');
        if (this._lastLineData) {
          data = this._lastLineData + data ;
        }
        var lines = data.split('\n');
        // if start is greater than 0, we are starting in the middle of the file, so we discard the first row
        if (!firstChunk && message.start > 0) {
          this._firstLineData = lines.splice(0,1);
          firstGoodByte = message.start + this._firstLineData.length + 1;
          if (message.start > firstGoodByte) {
            console.log("message.start is greater than firstGoodByte. message.start: ", message.start, "firstGoodByte: ", firstGoodByte);
          }
        }
        this._lastLineData = lines.splice(lines.length-1,1)[0];
        var textLines = "";
        lines.forEach(function(line) {
          lastGoodByte += line.length + sizeOfNewLine; // add back the length of the \n
          textLines += line + '\n';
        }, this);
        this.push(textLines);
        socket.emit('status', {message : "byteCounter._transform"});
        socket.emit("status", {message : "from server: firstGoodByte: " + firstGoodByte + " lastGoodByte: " + lastGoodByte});
        firstChunk = true;
        done();
      };

      byteCounter._flush = function (done) {
        socket.emit('status', {message : "byteCounter._flush"});
        if (this._lastLineData) {
          // only push data if it is the end of the file - otherwise it is likely to be a partial.
          if (fileSize === lastGoodByte + this._lastLineData.length + sizeOfNewLine) {
            lastGoodByte += this._lastLineData.length + sizeOfNewLine;
            this.push(this._lastLineData);
          }
        }
        this._lastLineData = null;
        done();
      };

      byteCounter.on('error', function(err){
        socket.emit('errorMessage', { message : "byteCounter error: " + err.message });
      });

      // Create the parser
      var parser = parse({
        delimiter: ",",
        comment: "#",
        skip_empty_lines: true,
        auto_parse: true,
        columns: columns
      });

      // Catch any error
      parser.on('error', function(err){
        socket.emit('errorMessage', { message : "parse error: " + err.message });
      });

      parser.on('flush', function(){
        socket.emit('status', { message : "Parser flush." });
      });

      parser.on('readable', function(){
        var row;
        while( null !== (row = parser.read()) ) {
          if (rows.length < 100) {
            rows.push(row);
          } else {
            sendRows();
          }
        }
      });

      // When we are done, test that the parsed output matched what expected
      parser.on('finish', function(){
        socket.emit("finish", { message : "Parser finished." });
      });

      parser.on('end', function(){
        if (rows.length > 0) {
          sendRows();
        }
        // socket.emit("status", { message : "Parser end. File size: " + fileSize + ". Total bytes: " + lastGoodByte });
      });

      // socket.emit('status', { message : "Getting " + message.path });
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
            start : message.start,
            end : Math.min(message.end, fileSize)
          };
          fs.createReadStream(message.path, options).pipe(byteCounter).pipe(parser);
        }
      });
    }

  });

  socket.on('getRemoteFile', function(message) {
    var Parser = parserFactory();
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
