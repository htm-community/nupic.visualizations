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
      byteLimit = 64000,      // max number of rows to read before pausing the stream
      byteCount = 0,
      Reader = null;      // the currently open stream

  // global function for sending data back to the client
  function sendRows(rows) {
    columns = Object.keys(rows[0]);
    socket.emit("data", {
      fileSize : fileSize,
      //firstGoodByte : firstGoodByte, // TODO: how to handle starting on a partial line
      //lastGoodByte : lastGoodByte,
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
    socket.emit('status', {message : "byteCounter._flush"});
    done();
  };

  byteCounter.on('error', function(err){
    socket.emit('errorMessage', { message : "byteCounter error: " + err.message });
  });


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
        var Parser = makeParser(columns);
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
            // read file
            Reader = fs.createReadStream(localFilePath, {objectMode : true});

            Reader.on('error', function(err){
              socket.emit('errorMessage', {message : "File reader error: " + err.message});
            });

            Reader.on('data', function(chunk) {
              byteCount += chunk.length;
              if (byteCount > byteLimit) {
                Reader.pause();
              }
            });

            Reader.pipe(byteCounter).pipe(Parser);
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
