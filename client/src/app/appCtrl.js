// Web UI:

angular.module('app').controller('appCtrl', ['$scope', '$http', '$timeout', 'appConfig', '$interval', function($scope, $http, $timeout, appConfig, $interval) {

  $scope.view = {
    fieldState: [],
    graph: null,
    dataField: null,
    optionsVisible: true,
    filePath: "",
    loadedFileName: "",
    errors: [],
    loading: false,
    windowing : {
      threshold : appConfig.MAX_FILE_SIZE,
      size : -1, // changed to WINDOW_SIZE on 'windowing' / large files. //TODO add UI for this?
      show : false,
      paused : false,
      aborted : false,
      update_interval : 1, //FIXME Math.round(appConfig.WINDOW_SIZE / 10.0), //every N rows render (10% change)
    }, 
    monitor : { // online monitoring
      clock : undefined, // the function in setIteration
      interval : 0, // dT
      lastChunkIter : 0, // helper, for speed we render only chunks with iter>last
    },
    file : { // info about the input file
      size : 0, //getFileSize sets
      file : null,
      name : null,
      path : null,
      loadingInProgress : false, // set true on start of file loading
      local : true, //canDownload
      streaming: false, //canDownload sets
    },
  };

  var loadedCSV = [],
    loadedFields = [], //=CSV header (parsed)
    backupCSV = [],
    timers = {},
    useIterationsForTimestamp = false,
    iteration = 0,
    resetFieldIdx = -1,
    streamParser = null,
    firstDataLoaded = false;


  // the "Show/Hide Options" button
  $scope.toggleOptions = function() {
    $scope.view.optionsVisible = !$scope.view.optionsVisible;
    if ($scope.view.graph) {
      timers.resize = $timeout(function() {
        $scope.view.graph.resize();
      });
    }
  };

  // main "load" function that supports both URL/local file
  // takes care of monitoring/streaming-data plots: if appConfig.POLLING_INTERVAL > 0 keep polling the file,sleeping
  $scope.loadFile = function(event) {
    // react to the file-selector event
    var src = $scope.view.file.path;
    if (event !== null) {
      $scope.view.file.file = event.target.files[0];
      $scope.view.file.name = $scope.view.file.file.name;
      $scope.view.file.path = event.target.files[0].name;
      $scope.view.filePath = $scope.view.file.path; //TODO remove this
      src = $scope.view.file.file;
    }
    loadFile(src);
    setMonitoringTimer(appConfig.POLLING_INTERVAL, src); //FIXME create an entry element for numeric value in UI for this, each change should call setMonitoringTimer()
  };

  // set up interval for cuntinuous monotoring/timer
  // param interval: in ms, <=0 means disabled
  // do not start parallel timers, clear existing (and optionally set new)
  var setMonitoringTimer = function(interval, src) {
    if (angular.isDefined($scope.view.monitor.clock) || interval <= 0) { //disable the old one
      $interval.cancel($scope.view.monitor.clock); //invalidate 
      $scope.view.monitor.clock = undefined;
      $scope.view.monitor.interval = 0;
    }

    if (interval > 0) {
      handleError("Monitoring mode started, update interval "+appConfig.POLLING_INTERVAL+"ms. ", "warning",true);
      $scope.view.monitor.interval = interval;
      $scope.view.monitor.clock = $interval(function () {loadFile(src); console.log("updating...");}, $scope.view.monitor.interval); //FIXME work with remote too
    }
  };

  // helper fn for timer/monitoring in loadFile
  // param file = File (for local), or string filePath for remote
  var loadFile = function(file) {
    if ($scope.view.file.loadingInProgress) {
      console.log("File was not completely read yet, cancelling another re-read till done!");
      return;
    }
    $scope.view.file.loadingInProgress = true;
    $scope.view.loading = true;
    // will set the local file= true/false, promise //FIXME use all() to combine 2 promises
    $scope.canDownload().then(
      function () {getFileSize(file).then(function () {doThis();}, function () {console.log("FAIL 2");} );}, 
      function () {console.log("FAIL");});

    function doThis() { //just wrapper
      $scope.view.windowing.show = false;
      $scope.view.windowing.paused = false;
      $scope.view.windowing.aborted = false;
      $scope.$broadcast("fileUploadChange");
      console.log("File size "+$scope.view.file.size);
      if ($scope.view.file.size > $scope.view.windowing.threshold && $scope.view.windowing.threshold !== -1) {
        $scope.view.windowing.show = true;
        $scope.view.windowing.size = appConfig.WINDOW_SIZE;
        handleError("File too large, automatic sliding window enabled.", "warning");

        if ($scope.view.file.streaming) {
          console.log("streamig...");
          downloadFile(file, "streamRemote");
        } else if ($scope.view.file.local) {
          downloadFile(file, "streamLocal");
        }
      } else {
        downloadFile(file, "download"); // fallback, or small file
      }
    } //end doThis
  };


  // test if a remote file can be downloaded.
  // "disables" the download button in UI
  // A file can be downloaded if: 1. is a URL; 2. server supports "Range" header;
  // also sets file.local, file.streaming ; as a promise 
  $scope.canDownload = function() {
    var pathParts = $scope.view.filePath.split("://");
    if ((pathParts[0] === "https" || pathParts[0] === "http") && pathParts.length > 1 && pathParts[1].length > 0) {
      $scope.view.file.local = false;
      // we do a quick test here to see if the server supports the Range header.
      // If so, we try to stream. If not, we try to download.
      $http.head($scope.view.filePath,{'headers' : {'Range' : 'bytes=0-32'}}).then(
        function(response){ 
          if(response.status === 206) { 
            console.log("server supports remote streaming");
            $scope.view.file.streaming = true;
            return true; 
          } else { 
            handleError("Server does not support remote file streaming. (Missing Range HTTP header).", "danger", true);
            $scope.view.file.streaming = false;
            return false; 
          } 
        },
        function() {
            $scope.view.file.streaming = false;
            return false;
       }); 
    } else { // not a remote URL
      $scope.view.file.local = true;
      $scope.view.file.streaming = true; //FIXME should here on local be streaming?
      return false;
    }
  };

  // get size of a file
  // param file - local File object, or URL(string) to a remote file
  // return number (as a promise!)
  var getFileSize = function(file) {
    if (typeof(file)=="object") { // intentionally not ===
      $scope.view.file.size = file.size;
      return file.size;
    } else {
      $http.head(file).then(
        function(response){
          $scope.view.file.size = response.headers('Content-Length');
          return response.headers('Content-Length');
        }, 
        function() {
         handleError("Failed to get remote file's size", "danger", true);
         $scope.view.file.size = -1;
         return -1;
        }
      );
    }
  };

  $scope.abortParse = function() {
    if (angular.isDefined(streamParser) && angular.isDefined(streamParser.abort)) {
      streamParser.abort();
      $scope.view.windowing.paused = false;
      $scope.view.windowing.aborted = true;
    }
  };

  $scope.pauseParse = function() {
    if (angular.isDefined(streamParser) && angular.isDefined(streamParser.pause)) {
      streamParser.pause();
      $scope.view.windowing.paused = true;
    }
  };

  $scope.resumeParse = function() {
    if (angular.isDefined(streamParser) && angular.isDefined(streamParser.resume)) {
      streamParser.resume();
      $scope.view.windowing.paused = false;
    }
  };

  var getRemoteFileName = function(url) {
    var pathParts = url.split("/");
    return pathParts[pathParts.length - 1];
  };

 
  var loadData = function(data) {
    console.log("SLOW");
    var tmpTime = -1;
    for (var rowId = 0; rowId < data.length; rowId++) {
      var row = [];
      for (var colId = 0; colId < loadedFields.length; colId++) {
        var fieldName = loadedFields[colId];
        var fieldValue = data[rowId][fieldName]; // read field's value
        if (fieldName === appConfig.TIMESTAMP) { // dealing with timestamp. See generateFieldMap
          iteration++;
          if (useIterationsForTimestamp) {
            fieldValue = iteration;
          } else if (typeof(fieldValue) === "number") { // use numeric timestamps/x-data
            //fieldValue; // keep as is
          } else if (typeof(fieldValue) === "string" && parseDate(fieldValue) !== null) { // use date string timestamps
            fieldValue = parseDate(fieldValue);
          } else { // unparsable timestamp field
            handleError("Parsing timestamp failed, fallback to using iteration number", "warning", true);
            fieldValue = iteration;
          }
          // check time monotonicity
          if (fieldValue <= tmpTime && data[rowId][resetFieldIdx] !== 1) {
            handleError("Your time is not monotonic at row " + iteration + "! Graphs are incorrect.", "danger", false);
            console.log("Incorrect timestamp!");
            break; //commented out = just inform, break = skip row
          }
          tmpTime = fieldValue;
        }
        else { // process other (non-date) data columns
          // FIXME: this is an OPF "bug", should be discussed upstream
          if (fieldValue === "None") {
            fieldValue = appConfig.NONE_VALUE_REPLACEMENT;
          }
        }
        row.push(fieldValue);
      }
      if (row.length !== loadedFields.length) {
        console.log("Incomplete row loaded " + row + "; skipping.");
        continue;
      }
      loadedCSV.push(row);
      backupCSV.push(angular.extend([], row));

      if ($scope.view.windowing.size !== -1 && loadedCSV.length > $scope.view.windowing.size) { // sliding window trim
        loadedCSV.shift();
        backupCSV.shift();
      }
    }
    if ($scope.view.graph === null) {
      renderGraph();
    } else if ((iteration % $scope.view.windowing.update_interval) === 0) {
      //console.log("render "+$scope.view.windowing.update_interval+ " iter="+iteration+" CSV sz="+loadedCSV.length );
      $scope.view.graph.updateOptions({
        'file': loadedCSV
      });
    }
    if (!firstDataLoaded) {
      $scope.$apply();
      firstDataLoaded = true;
    }
  };

  var resetFields = function() {
    // reset fields
    $scope.view.fieldState.length = 0;
    $scope.view.graph = null;
    $scope.view.dataField = null;
    $scope.view.errors.length = 0;
    $scope.view.loadedFileName = "";
    //$scope.view.windowing.show = false;
    //$scope.view.windowing.paused = false;
    //$scope.view.windowing.aborted = false;
    useIterationsForTimestamp = false;
    iteration = 0;
    loadedCSV.length = 0;
    loadedFields.length = 0;
    firstDataLoaded = false;
  };

  // function to "download" a file, 
  // with param. 'mode': "download","streamLocal","streamRemote"
  var downloadFile = function(url, mode) {
    resetFields();
    Papa.RemoteChunkSize = appConfig.REMOTE_CHUNK_SIZE;
    Papa.LocalChunkSize = appConfig.LOCAL_CHUNK_SIZE; // set this to a reasonable size
    var iter = 0;
    Papa.parse(url, {
      download: true,
      skipEmptyLines: true,
      header: true,
      dynamicTyping: true,
      worker: false, // multithreaded, !but does NOT work with other libs in app.js or streaming
      comments: "#",
      // used for 'download' mode
      complete: function(results) {
        console.log("COMPLETED");
        $scope.view.monitor.lastChunkIter = iter;
        $scope.view.file.loadingInProgress = false; //completed
        if (mode !== "download") {
          return;
        }
        if (!angular.isDefined(results.data)) {
          handleError("An error occurred when attempting to download file.", "danger");
        } else {
          $scope.view.loadedFileName = getRemoteFileName(url);
          loadedFields = generateFieldMap(results.data, appConfig.EXCLUDE_FIELDS);
          results.data.splice(0, appConfig.HEADER_SKIPPED_ROWS);
          loadData(results.data);
        }
        $scope.view.loading = false;
        $scope.$apply();
      },

      // used for 'stream*' mode
      chunk: function(chunk, parser) {
        iter++;
        streamParser = parser;

        // as files grow very large in continuous monitoring
        // for speed reasons (on large files) in the online monitor mode, 
        // we skip renderning all but the last window
        // this technique only helps after the file was once read to the end (completed)
        if(iter <= $scope.view.monitor.lastChunkIter && iter > 1) {
          console.log("Skipping: iter "+iter+" < = "+$scope.view.monitor.lastChunkIter);
          return;
        } else if (iter*appConfig.LOCAL_CHUNK_SIZE + 10*appConfig.LOCAL_CHUNK_SIZE < $scope.view.file.size) { //FIXME how ensure the safety buffer (10*XX) 
        // ...from CHUNK_SIZE (B) responds to BUFFER_SIZE (rows)
          console.log("Skipping 2: iter "+iter+", bytes read "+iter*appConfig.LOCAL_CHUNK_SIZE+" < "+$scope.view.file.size);
          return;
        } else {
          console.log("working");
          loadData(chunk.data); // parsing and rendering is slow
        }
      },
      //fastMode: true, // automatically enabled if no " appear
      beforeFirstChunk: function(chunk) {
        if (mode === "streamRemote") {
          $scope.view.loadedFileName = getRemoteFileName(url);
        } else if (mode === "streamLocal") {
          $scope.view.loadedFileName = url.name;
        }
        var rows = chunk.split(/\r\n|\r|\n/);
        loadedFields = generateFieldMap(rows, appConfig.EXCLUDE_FIELDS);
        rows.splice(1, appConfig.HEADER_SKIPPED_ROWS);
        $scope.view.loading = false;
        rows = rows.join('\n');
        return rows;
      },
      // end of stream*
      error: function(error) {
        $scope.view.loading = false;
        handleError("Could not download/stream the file.", "danger");
      }
    });
  };


  // show errors as "notices" in the UI
  var handleError = function(error, type, showOnce) {
    showOnce = typeof showOnce !== 'undefined' ? showOnce : false;
    exists = false;
    if (showOnce) {
      // loop through existing errors by 'message'
      errs = $scope.view.errors;
      for (var i = 0; i < errs.length; i++) {
        if (errs[i].message === error) { // not unique
          return;
        }
      }
    }
    $scope.view.errors.push({
      "message": error,
      "type": type
    });
    $scope.$apply();
  };

  $scope.clearErrors = function() {
    $scope.view.errors.length = 0;
  };

  $scope.clearError = function(id) {
    $scope.view.errors.splice(id, 1);
  };

  // parseDate():
  // takes a string and attempts to convert it into a Date object
  // return: Date object, or null if parsing failed
  var parseDate = function(strDateTime) { // FIXME: Can using the ISO format simplify this?
    // can we get the browser to parse this successfully?
    var numDate = new Date(strDateTime);
    if (numDate.toString() !== "Invalid Date") {
      return numDate;
    }
    var dateTime = String(strDateTime).split(" "); // we are assuming that the delimiter between date and time is a space
    var args = [];
    // is the date formatted with slashes or dashes?
    var slashDate = dateTime[0].split("/");
    var dashDate = dateTime[0].split("-");
    if ((slashDate.length === 1 && dashDate.length === 1) || (slashDate.length > 1 && dashDate.length > 1)) {
      // if there were no instances of delimiters, or we have both delimiters when we should only have one
      handleError("Could not parse the timestamp: " + strDateTime, "warning", true);
      return null;
    }
    // if it is a dash date, it is probably in this format: yyyy:mm:dd
    if (dashDate.length > 2) {
      args.push(dashDate[0]);
      args.push(dashDate[1]);
      args.push(dashDate[2]);
    }
    // if it is a slash date, it is probably in this format: mm/dd/yy
    else if (slashDate.length > 2) {
      args.push(slashDate[2]);
      args.push(slashDate[0]);
      args.push(slashDate[1]);
    } else {
      handleError("There was something wrong with the date in the timestamp field.", "warning", true);
      return null;
    }
    // is there a time element?
    if (dateTime[1]) {
      var time = dateTime[1].split(":");
      args = args.concat(time);
    }
    for (var t = 0; t < args.length; t++) {
      args[t] = parseInt(args[t]);
    }
    numDate = new Function.prototype.bind.apply(Date, [null].concat(args));
    if (numDate.toString() === "Invalid Date") {
      handleError("The timestamp appears to be invalid.", "warning", true);
      return null;
    }
    return numDate;
  };

  // normalize select field with regards to the Data choice.
  $scope.normalizeField = function(normalizedFieldId) {
    // we have to add one here, because the data array is different than the label array
    var fieldId = normalizedFieldId + 1;
    if ($scope.view.dataField === null) {
      console.warn("No data field is set");
      return;
    }
    var dataFieldId = parseInt($scope.view.dataField) + 1;
    var getMinOrMaxOfArray = function(numArray, minOrMax) {
      return Math[minOrMax].apply(null, numArray);
    };
    // get the data range - min/man
    var dataFieldValues = [];
    var toBeNormalizedValues = [];
    for (var i = 0; i < loadedCSV.length; i++) {
      if (typeof loadedCSV[i][dataFieldId] === "number" && typeof loadedCSV[i][fieldId] === "number") {
        dataFieldValues.push(loadedCSV[i][dataFieldId]);
        toBeNormalizedValues.push(loadedCSV[i][fieldId]);
      }
    }
    var dataFieldRange = getMinOrMaxOfArray(dataFieldValues, "max") - getMinOrMaxOfArray(dataFieldValues, "min");
    var normalizeFieldRange = getMinOrMaxOfArray(toBeNormalizedValues, "max") - getMinOrMaxOfArray(toBeNormalizedValues, "min");
    var ratio = dataFieldRange / normalizeFieldRange;
    // multiply each anomalyScore by this amount
    for (var x = 0; x < loadedCSV.length; x++) {
      loadedCSV[x][fieldId] = parseFloat((loadedCSV[x][fieldId] * ratio).toFixed(10));
    }
    $scope.view.graph.updateOptions({
      'file': loadedCSV
    });
  };

  $scope.denormalizeField = function(normalizedFieldId) {
    var fieldId = normalizedFieldId + 1;
    for (var i = 0; i < loadedCSV.length; i++) {
      loadedCSV[i][fieldId] = backupCSV[i][fieldId];
    }
    $scope.view.graph.updateOptions({
      'file': loadedCSV
    });
  };

  $scope.renormalize = function() {
    for (var i = 0; i < $scope.view.fieldState.length; i++) {
      if ($scope.view.fieldState[i].normalized) {
        $scope.normalizeField($scope.view.fieldState[i].id);
      }
    }
  };

  var updateValue = function(fieldName, value) {
    for (var f = 0; f < $scope.view.fieldState.length; f++) {
      if ($scope.view.fieldState[f].name === fieldName) {
        $scope.view.fieldState[f].value = value;
        break;
      }
    }
  };

  var setDataField = function(fieldName) {
    for (var i = 0; i < $scope.view.fieldState.length; i++) {
      if ($scope.view.fieldState[i].name === fieldName) {
        $scope.view.dataField = $scope.view.fieldState[i].id;
        break;
      }
    }
  };

  var setColors = function(colors) {
    for (var c = 0; c < colors.length; c++) {
      $scope.view.fieldState[c].color = colors[c];
    }
  };

  // say which fields will be plotted (all numeric - excluded)
  // based on parsing the last-1 (to omit Nones at the start; and to avoid incompletely chunked row)
  // row of the data.
  // return: array with names of numeric columns
  // If TIMESTAMP is not present, use iterations instead and set global useIterationsForTimestamp=true
  // also determine if dealing with OPF file and use its special format (skip 3 header rows, ...)
  var generateFieldMap = function(rows, excludes) {
    var header = rows[0].split(',');
    // OPF
    var meta = Papa.parse(rows[2], {
      dynamicTyping: true,
      skipEmptyLines: true,
      comments: '#'
    }).data[0]; // to get correct data-types
    var isOPF = true; //determine OPF by having only meta chars at 3rd row (not numeric, unlike normal data)
    for (var i = 0; i < meta.length; i++) {
      if (typeof(meta[i]) === "number") {
        isOPF = false;
      } else if (meta[i] === 'R' || meta[i] === 'r') {
        resetFieldIdx = i;
      }
    }
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
  };

  $scope.toggleVisibility = function(field) {
    $scope.view.graph.setVisibility(field.id, field.visible);
    if (!field.visible) {
      field.value = null;
    }
  };

  $scope.showHideAll = function(value) {
    for (var i = 0; i < $scope.view.fieldState.length; i++) {
      $scope.view.fieldState[i].visible = value;
      $scope.view.graph.setVisibility($scope.view.fieldState[i].id, value);
      if (!value) {
        $scope.view.fieldState[i].value = null;
      }
    }
  };

  $scope.updateHighlight = function(field) {
    if (field.highlightThreshold === null) {
      return;
    }
    if (field.highlightThreshold === "") {
      field.highlightThreshold = null;
    }
    $scope.view.graph.updateOptions({});
  };

  // the main "graphics" is rendered here
  var renderGraph = function() {
    var fields = [];
    var div = document.getElementById("dataContainer");
    //renderedCSV = angular.copy(loadedCSV);
    //backupCSV = angular.copy(loadedCSV);
    //renderedFields = angular.copy(loadedFields);
    //$scope.view.renderedFileName = $scope.view.loadedFileName;
    // build field toggle array
    $scope.view.fieldState.length = 0;
    $scope.view.dataField = null;
    var counter = 0;
    var usedIterations = useIterationsForTimestamp;
    for (var i = 0; i < loadedFields.length; i++) {
      var fName = loadedFields[i];
      if (fName === appConfig.TIMESTAMP || usedIterations) {
        usedIterations = false;
        continue;
      }
      $scope.view.fieldState.push({
        name: fName,
        id: counter,
        visible: true,
        normalized: false,
        value: null,
        color: "rgb(0,0,0)",
        highlighted: false,
        highlightThreshold: null
      });
      counter++;
    }
    $scope.view.graph = new Dygraph(
      div,
      loadedCSV, {
        labels: loadedFields,
        labelsUTC: false, // make timestamp in UTC to have consistent graphs
        showLabelsOnHighlight: true,
        xlabel: "Time",
        ylabel: "Values",
        strokeWidth: 1,
        //!strokeBorderWidth: 0.1,
        sigFigs: 5,
        // WARNING: this causes huge performance speed penalty!!
        // highlightSeriesOpts: { // series hovered get thicker
        //   strokeWidth: 2,
        //   strokeBorderWidth: 1,
        //   highlightCircleSize: 3
        // },
        // select and copy functionality
        // FIXME: avoid the hardcoded timestamp format
        pointClickCallback: function(e, point) {
          timestamp = moment(point.xval);
          timestampString = timestamp.format("YYYY-MM-DD HH:mm:ss.SSS000");
          window.prompt("Copy to clipboard: Ctrl+C, Enter", timestampString);
        },
        // zoom functionality - toggle the 2 options in ZOOM
        animatedZooms: true,
        showRangeSelector: appConfig.ZOOM === "RangeSelector",
        highlightCallback: function(e, x, points, row, seriesName) { // ZOOM === "HighlightSelector"
          for (var p = 0; p < points.length; p++) {
            updateValue(points[p].name, points[p].yval);
          }
          $scope.$apply();
        },
        drawCallback: function(graph, is_initial) {
          if (is_initial) {
            setColors(graph.getColors());
          }
        },
        underlayCallback: highlightAnomaly,
      }
    );
  };

  $scope.$on("$destroy", function() {
    angular.forEach(timers, function(timer) {
      $timeout.cancel(timer);
    });
  });


  // highlight areas where a select function value crosses a threshold
  // used in dygraph's underlayCallback
  function highlightAnomaly(canvas, area, g) {

    var timeIdx = loadedFields.indexOf(appConfig.TIMESTAMP);

    // draw rectangle on x0..x1
    function highlight_period(x_start, x_end, color) {
      var canvas_left_x = g.toDomXCoord(x_start);
      var canvas_right_x = g.toDomXCoord(x_end);
      var canvas_width = canvas_right_x - canvas_left_x;
      canvas.fillStyle = color;
      canvas.fillRect(canvas_left_x, area.y, canvas_width, area.h);
    }

    // find x values matching condition on y-value
    // params: data (all fields), watchedFieldName (string), threshold (for condition >thr)
    // return array with indices of anomalies
    function find_where(data, watchedFieldName, threshold) {
      var results = [];
      var fnIdx = loadedFields.indexOf(watchedFieldName);
      if (fnIdx === -1) {
        handleError("Highlighting cannot work, field " + watchedFieldName + " not found!", "danger", true);
        return [];
      }
      for (var i = 0; i < data.length; i++) {
        var value = data[i][fnIdx];
        // the condition is here
        if (value >= threshold) {
          var time = data[i][timeIdx];
          //console.log("Found anomaly at "+time+" with value "+value);
          results.push(time);
        }
      }
      return results;
    } //end find_where

    //highlight_period(2, 5, yellow); //test
    // find relevant points
    for (var i = 0; i < $scope.view.fieldState.length; i++) {
      var selected, modDt, color, field;
      field = $scope.view.fieldState[i];
      if (field.highlighted === true && field.highlightThreshold !== null) {
        selected = find_where(backupCSV, field.name, field.highlightThreshold);
        // compute optimal/visible high. radius as 1% of screen area
        modDt = 0.01 * loadedCSV.length; 
        // plot all of them
        var transparency = 0.4; // min/max opacity for overlapping highs
        color = field.color.replace("rgb", "rgba").replace(")", "," + transparency + ")");
        var lastHigh = -1;
        for (var x = 0; x < selected.length; x++) {
          if(selected[x] - modDt >= lastHigh) {
            highlight_period(selected[x] - modDt, selected[x] + modDt, color);
            lastHigh = selected[x] + modDt;
          }
        }
      }
    }

  } // end highlightAnomaly callback


}]);
