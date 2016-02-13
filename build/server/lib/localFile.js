var parse = require('csv-parse');
var fs = require('fs');
var request = require('request');
var stream = require('stream');

module.exports = function(socket) {

  var sizeOfNewLine = Buffer.byteLength('\n', 'utf8'),
      playTimer,            // timer for playing the file
      columns = true,       // this can be either true, or a string array. If it is an array, it will be the names of the columns
      fileSize = 0,         // the full size of the current file. This may change if the file is being actively updated.
      localFilePath = "",   // path to the file
      byteLimit = 64000,    // max number of rows to read before pausing the stream
      byteCount = 0,        // number of bytes streamed so far
      Reader = null,        // the currently open file stream
      ByteCounter = null,   // a transform stream which processes the file stream and feed the csv-parser
      Parser = null;        // the csv-parser transform stream

  // global function for sending data back to the client
  function sendRows(rows) {
    columns = Object.keys(rows[0]);
    socket.emit("data", {
      fileSize : fileSize,
      rows : rows,
      columns : columns
    });
    rows.length = 0;
  }

  function makeParser(columns) {
    var rows = [];
    var rowCounter = 0;
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

    parser.on('readable', function(){
      var row;
      while( null !== (row = parser.read()) ) {
        if (rows.length < 100) {
          rows.push(row);
        } else {
          sendRows(rows);
        }
      }
    });

    // When we are done, test that the parsed output matched what expected
    parser.on('finish', function(){
      socket.emit('finish', { message : "Parser finished." });
    });

    parser.on('end', function(){
      if (rows.length > 0) {
        sendRows(rows);
      }
      socket.emit('status', { message : "Parser end. File size: " + fileSize });
     // Reader.pause();
    });

    return parser;
  }

  // we need to create a counter that will count the byte position
  // of the stream at the last good row. This is because when picking an arbitrary
  // position in the file, we will most likely be choosing a position somewhere in
  // the middle of a line. So, we want to save the position of the last line so when
  // we ask for more data, we can read from that point.

  function makeByteCounter() {

    var byteCounter = new stream.Transform({objectMode : true});

    byteCounter._transform = function (chunk, encoding, done) {
      var data = chunk.toString('utf8');
      if (this._lastLineData) {
        data = this._lastLineData + data ;
      }
      var lines = data.split('\n');
      this._lastLineData = lines.splice(lines.length-1,1)[0];
      var textLines = "";
      lines.forEach(function(line) {
        textLines += line + '\n';
      }, this);
      this.push(textLines);
      done();
    };

    byteCounter._flush = function (done) {
      socket.emit('status', {message : "ByteCounter._flush"});
      done();
    };

    byteCounter.on('error', function(err){
      socket.emit('errorMessage', { message : "ByteCounter error: " + err.message });
    });

    return byteCounter;

  }


  socket.on('playLocalFile', function(message){
    if (columns === true || columns.length < 1) {
      socket.emit('errorMessage', {message : "Missing column names."});
      return;
    }
    playTimer = setInterval(function(){
      Reader.resume();
    },500);
  });

  socket.on('pauseLocalFile', function(message){
    clearInterval(playTimer);
    Reader.pause();
  });

  // handle local files
  socket.on('readLocalFile', function(message) {
    if (Reader && ByteCounter) {
      Reader.unpipe(ByteCounter);
    }
    if (ByteCounter && Parser) {
      ByteCounter.unpipe(Parser);
    }
    if (playTimer) {
      clearInterval(playTimer);
    }
    localFilePath = message.path;
    byteLimit = message.byteLimit;
    byteCount = 0;
    columns = (message.columns) ? message.columns : true;
    // get stats on the file
    fs.stat(localFilePath, function(err, stats){
      if(err) {
        socket.emit("fileRetrievalError", {
          statusCode : response.statusCode,
          statusMessage : response.statusMessage
        });
      } else {
        fileSize = stats.size;
        Parser = makeParser(columns);
        ByteCounter = makeByteCounter();
        fs.access(localFilePath, fs.R_OK, function (err) {
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
            // read the file

            // Reader : Readable
            // ByteCounter : Transform
            // Parser : Transform

            Reader = fs.createReadStream(localFilePath, {objectMode : true});
            Reader.pause();
            Reader.on('error', function(err){
              socket.emit('errorMessage', {message : "File reader error: " + err.message});
            });
            Reader.on('data', function(chunk) {
              byteCount += chunk.length;
              socket.emit('status', {message : "byteCount: " + byteCount + ". byteLimit: " + byteLimit + "."});
              if (byteCount > byteLimit) {
                Reader.pause();
              }
            });
            Reader.on('end', function(){
              if (playTimer) {
                clearInterval(playTimer);
              }
            });
            Reader.pipe(ByteCounter).pipe(Parser);
            Reader.resume();
          }
        });
      }
    });
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
