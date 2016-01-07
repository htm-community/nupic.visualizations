// Web UI:

angular.module('app').controller('appCtrl', ['$scope', '$http', '$timeout', 'appConfig', function($scope, $http, $timeout, appConfig) {

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
      show : false,
      paused : false,
      aborted : false,
    }, 
    monitor : { // online monitoring
      clock : null, // the function in setIteration
      interval : appConfig.POLLING_INTERVAL, // dT
      lastChunkIter : 0, // helper, for speed we render only chunks with iter>last
    },
    file : { // info about the input file
      size : 0,
    },
  };

  var loadedCSV = [],
    loadedFields = [], //=CSV header (parsed)
    backupCSV = [],
    timers = {},
    useIterationsForTimestamp = false,
    iteration = 0,
    slidingWindow = appConfig.SLIDING_WINDOW,
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

  // handle downloading (or streaming, if supported) a remote file (from URL => canDownload==True)
  $scope.getRemoteFile = function() {
    $scope.view.windowing.show = false;
    $scope.view.windowing.paused = false;
    $scope.view.windowing.aborted = false;
    slidingWindow = false;
    $scope.$broadcast("fileUploadChange");
    $scope.view.loading = true;
    $scope.view.file.size = getFileSize($scope.view.filePath);
    console.log("File size "+$scope.view.file.size);
    if ($scope.canDownload() && $scope.view.file.size > appConfig.MAX_FILE_SIZE) { 
      console.log("streamig...");
      downloadFile($scope.view.filePath, "streamRemote");
    } else {
      downloadFile($scope.view.filePath, "download"); // fallback, or small file
    }  
  };

  // handle downloading (or Browsing) a local file
  $scope.getLocalFile = function(event) {
    $scope.view.filePath = event.target.files[0].name;
    $scope.view.file.size = getFileSize(event.target.files[0]);
    console.log("File size "+$scope.view.file.size);
    if ($scope.view.file.size > appConfig.MAX_FILE_SIZE) {
      slidingWindow = true;
      $scope.view.windowing.show = true;
    }
    $scope.view.loading = true;
    downloadFile(event.target.files[0], "streamLocal");
  };

  // main "load" function that supports both URL/local file
  // takes care of monitoring/streaming-data plots: if appConfig.POLLING_INTERVAL > 0 keep polling the file,sleeping
  $scope.loadFile = function(event) {
    loadFileHelper(event);
    if (appConfig.POLLING_INTERVAL > 0) {
      handleError("Monitoring mode started, update interval "+appConfig.POLLING_INTERVAL+"ms. ", "warning",true);
      $scope.view.monitor.clock = setInterval(function () {loadFileHelper(event); console.log("troll");}, $scope.view.monitor.interval); //FIXME work with remote too
    }
  };

  // helper fn for timer/monitoring in loadFile
  var loadFileHelper = function(event) {
    // react to change in POLLING_INTERVAL
    if ($scope.view.monitor.interval != appConfig.POLLING_INTERVAL) {
      console.log("Polling interval changed to"+appConfig.POLLING_INTERVAL);
      clearInterval($scope.view.monitor.clock); //invalidate
      if (appConfig.POLLING_INTERVAL > 0) { //set new value
        $scope.view.monitor.interval = appConfig.POLLING_INTERVAL;
        $scope.view.monitor.clock = setInterval(function (){loadFileHelper(event);}, appConfig.POLLING_INTERVAL);
      }
    }
    // call the file readers
    if ($scope.canDownload()) {
      $scope.getRemoteFile();
    } else {
      $scope.getLocalFile(event);
    }
  };


  // test if a remote file can be downloaded.
  // "disables" the download button in UI
  // A file can be downloaded if: 1. is a URL; 2. server supports "Range" header;
  $scope.canDownload = function() {
    var pathParts = $scope.view.filePath.split("://");
    if ((pathParts[0] === "https" || pathParts[0] === "http") && pathParts.length > 1 && pathParts[1].length > 0) {
      // we do a quick test here to see if the server supports the Range header.
      // If so, we try to stream. If not, we try to download.
      try{
      $http.head($scope.view.filePath,{'headers' : {'Range' : 'bytes=0-32'}}).then(
        function(response){ 
          if(response.status === 206) { 
            console.log("server supports remote streaming");
            return true; 
          } else { 
            handleError("Server does not support remote file streaming. (Missing Range HTTP header).", "danger", true);
            return false; 
          } 
        },
        function() {return false;}
      ); 
      }catch(err) {
        return false;
      }
    } else { // not a remote URL
      return false;
    }
  };

  // get size of a file
  // param file - local File object, or URL(string) to a remote file
  // return number
  var getFileSize = function(file) {
    if (typeof(file)=="object") { // intentionally not ===
      return file.size;
    } else {
      $http.head(file).then(
        function(response){
          return response.headers('Content-Length');
        }, 
        function() {
         handleError("Failed to get remote file's size", "danger", true);
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
    var tmpTime = -1;
    for (var rowId = 0; rowId < data.length; rowId++) {
      var arr = [];
      for (var colId = 0; colId < loadedFields.length; colId++) {
        var fieldName = loadedFields[colId];
        var fieldValue = data[rowId][fieldName]; // read field's value
        if (fieldName === appConfig.TIMESTAMP) { // dealing with timestamp. See generateFieldMap
          if (useIterationsForTimestamp) {
            fieldValue = iteration++;
          } else if (typeof(fieldValue) === "number") { // use numeric timestamps/x-data
            //fieldValue; // keep as is
          } else if (typeof(fieldValue) === "string" && parseDate(fieldValue) !== null) { // use date string timestamps
            fieldValue = parseDate(fieldValue);
          } else { // unparsable timestamp field
            handleError("Parsing timestamp failed, fallback to using iteration number", "warning", true);
            fieldValue = iteration;
          }
          // check time monotonicity
          if (fieldValue <= tmpTime) {
            handleError("Your time is not monotonic at row "+rowId+"! Graphs are incorrect.", "danger", false);
          }
          tmpTime = fieldValue;
        } else { // process other (non-date) data columns
          // FIXME: this is an OPF "bug", should be discussed upstream
          if (fieldValue === "None") {
            fieldValue = appConfig.NONE_VALUE_REPLACEMENT;
          }
        }
        arr.push(fieldValue);
      }
      if (slidingWindow && loadedCSV.length > appConfig.BUFFER_SIZE) {
        loadedCSV.shift();
        backupCSV.shift();
      }
      loadedCSV.push(arr);
      backupCSV.push(angular.extend([], arr));
    }
    if ($scope.view.graph === null) {
      renderGraph();
    } else if (loadedCSV.length > 0) {
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
    var firstChunkComplete = false;
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
        if (!firstChunkComplete) {
          streamParser = parser;
          loadedFields = generateFieldMap(chunk.data, appConfig.EXCLUDE_FIELDS);
          firstChunkComplete = true;
        }

        // as files grow very large in continuous monitoring
        // for speed reasons (on large files) in the online monitor mode, 
        // we skip renderning all but the last window
        // this technique only helps after the file was once read to the end (completed)
        if(iter <= $scope.view.monitor.lastChunkIter) {
          console.log("Skipping: iter "+iter+" < = "+$scope.view.monitor.lastChunkIter);
          return;
        } else if (iter*appConfig.LOCAL_CHUNK_SIZE + 10*appConfig.LOCAL_CHUNK_SIZE < $scope.view.file.size) { //FIXME how ensure the safety buffer (10*XX) from CHUNK_SIZE (B) responds to BUFFER_SIZE (rows)
        //
          console.log("Skipping 2: iter "+iter+", bytes read "+iter*appConfig.LOCAL_CHUNK_SIZE+" < "+$scope.view.file.size);
          return;
        } else {
          loadData(chunk.data); // parsing and rendering is slow
        }
      },
      beforeFirstChunk: function(chunk) {
        if (mode === "streamRemote") {
          $scope.view.loadedFileName = getRemoteFileName(url);
        } else if (mode === "streamLocal") {
          $scope.view.loadedFileName = url.name;
        }
        var rows = chunk.split(/\r\n|\r|\n/);
        rows.splice(1, appConfig.HEADER_SKIPPED_ROWS);
        $scope.view.loading = false;
        return rows.join('\n');
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
      handleError("Could not parse the timestamp", "warning", true);
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
  var generateFieldMap = function(rows, excludes) {
    // take end-1th row to avoid incompletely loaded data due to chunk size
    var row = rows[rows.length-2];
    if (!row.hasOwnProperty(appConfig.TIMESTAMP)) {
      handleError("No timestamp field was found, using iterations instead", "info");
      useIterationsForTimestamp = true; //global flag
    }
    // add all numeric fields not in excludes
    var headerFields = [];
    angular.forEach(row, function(value, key) {
      if ((typeof(value) === "number") && excludes.indexOf(key) === -1 && key !== appConfig.TIMESTAMP) {
        headerFields.push(key);
      }
    });
    // timestamp assumed to be at the beginning of the array
    headerFields.unshift(appConfig.TIMESTAMP); //append timestamp as 1st field
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
        color: "rgb(0,0,0)"
      });
      counter++;
    }
    $scope.view.graph = new Dygraph(
      div,
      loadedCSV, {
        labels: loadedFields,
        labelsUTC: false, // make timestamp in UTC to have consistent graphs
        showLabelsOnHighlight: false,
        xlabel: "Time",
        ylabel: "Values",
        strokeWidth: 1,
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
        }
      }
    );
  };

  $scope.$on("$destroy", function() {
    angular.forEach(timers, function(timer) {
      $timeout.cancel(timer);
    });
  });

}]);
