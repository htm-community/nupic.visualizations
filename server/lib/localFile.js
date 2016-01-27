var parse = require('csv-parse');
var fs = require('fs');
var each = require('foreach');

module.exports = function(socket) {

  socket.emit("status", {message : "connected"});
  // handle local files
  socket.on('getLocalFile', function(message, callBack) {
    socket.emit('status', { message : "Getting " + message.path });
    fs.access(message.path, fs.R_OK, function (err) {
      if (err) {
        if (err.code === "ENOENT") {
          socket.emit("error", {message : "File not found."});
        } else {
          socket.emit("error", {message : "Permission denied."}); // TODO explicily handle permission denied error.
        }
      } else {
        // Create the parser
        var firstChunk = true;
        var parser = parse({
          delimiter: ",",
          comment: "#",
          skip_empty_lines: true,
          auto_parse: true,
          columns: true
        });
        // Use the writable stream api
        parser.on('readable', function(){
          var record;
          while(record = parser.read()){
            console.log(record);
          }
        });
        // Catch any error
        parser.on('error', function(err){
          console.log(err.message);
        });
        // send chunks
        parser.on('data', function(chunk){
          //if (firstChunk) {
          //  generateFieldMap(chunk);
          //  firstChunk = false;
          //} else {
            socket.emit("data", chunk);
          //}
        });
        // When we are done, test that the parsed output matched what expected
        parser.on('finish', function(){
          socket.emit("status", {message : "Finished"});
        });
        // kick it off
        fs.createReadStream(message.path).pipe(parser);
      }
    });
  });
};


function generateFieldMap(rows,socket) {
  // say which fields will be plotted (all numeric - excluded)
  // based on parsing the last-1 (to omit Nones at the start; and to avoid incompletely chunked row)
  // row of the data.
  // return: array with names of numeric columns
  // If TIMESTAMP is not present, use iterations instead and set global useIterationsForTimestamp=true
  // also determine if dealing with OPF file and use its special format (skip 3 header rows, ...)
  var header = rows[0].split(',');
  var resetFieldIdx;
  // OPF
  var isOPF = true; //determine OPF by having only meta chars at 3rd row (not numeric, unlike normal data)
  each(rows, function(value, key) {
    if (typeof(value) === "number") {
      isOPF = false;
    } else if (value === 'R' || value === 'r') {
      resetFieldIdx = key;
    }
  });
  if (isOPF) {
    console.log("Detected OPF/NuPIC file. ");
    appConfig.HEADER_SKIPPED_ROWS = 3; //default for OPF
  }

  if (header.indexOf(appConfig.TIMESTAMP) === -1) {
    handleError("No timestamp field was found, using iterations instead", "info");
    useIterationsForTimestamp = true; //global flag
  } else if (isOPF && resetFieldIdx !== -1) { //TODO fix later support for OPF resets?
    handleError("OPF file with resets not supported. Ignoring timestamp and using iterations instead.", "info");
    useIterationsForTimestamp = true; //global flag
    //FIXME add new field time with orig time values
  }
  // add all numeric fields not in excludes
  var row = rows[rows.length - 2]; // take end-1th row to avoid incompletely loaded data due to chunk size
  row = Papa.parse(row, {
    dynamicTyping: true,
    skipEmptyLines: true,
    comments: '#'
  }); // to get correct data-types
  var headerFields = [];
  for (var j = 0; j < header.length; j++) {
    var value = row.data[0][j]; // Papa results structure
    var key = header[j];
    if ((typeof(value) === "number") && excludes.indexOf(key) === -1) {
      headerFields.push(key);
    }
  }

  // add 'threshold' field for anomaly detection
  //headerFields.push('threshold*');

  if (headerFields.indexOf(appConfig.TIMESTAMP) === -1) { //missing
    headerFields.unshift(appConfig.TIMESTAMP); //append timestamp as 1st field
  }
  return headerFields;
}

// read and parse a CSV file
/*
  var streamLocalFile = function(file) {
    console.log(typeof file);
    resetFields();
    Papa.LocalChunkSize = appConfig.LOCAL_CHUNK_SIZE; // set this to a reasonable size
    var firstChunkComplete = false;
    Papa.parse(file, {
      skipEmptyLines: true,
      header: true,
      dynamicTyping: true,
      worker: false, // multithreaded, !but does NOT work with other libs in app.js or streaming
      comments: "#",
      chunk: function(chunk, parser) {
        streamParser = parser;
        loadData(chunk.data);
      },
      beforeFirstChunk: function(chunk) {
        $scope.view.loadedFileName = file.name;
        var rows = chunk.split(/\r\n|\r|\n/);
        loadedFields = generateFieldMap(rows, appConfig.EXCLUDE_FIELDS);
        rows.splice(1, appConfig.HEADER_SKIPPED_ROWS);
        $scope.view.loading = false;
        rows = rows.join('\n');
        return rows;
      },
      //fastMode: true, // automatically enabled if no " appear
      error: function(error) {
        handleError(error, "danger");
        $scope.view.loading = false;
      }
    });
  };
*/
