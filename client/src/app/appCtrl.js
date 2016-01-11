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
      aborted : false
    }
  };

  var loadedCSV = [],
    loadedFields = [], //=CSV header (parsed)
    backupCSV = [],
    timers = {},
    useIterationsForTimestamp = false,
    iteration = 0,
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

  $scope.getRemoteFile = function() {
    $scope.view.windowing.show = false;
    $scope.view.windowing.paused = false;
    $scope.view.windowing.aborted = false;
    $scope.$broadcast("fileUploadChange");
    $scope.view.loading = true;
    // we do a quick test here to see if the server supports the Range header.
    // If so, we try to stream. If not, we try to download.
    $http.head($scope.view.filePath,{'headers' : {'Range' : 'bytes=0-32'}}).then(function(response){
      if(response.status === 206) {
        // now we check to see how big the file is
        $http.head($scope.view.filePath).then(function(response){
          var contentLength = response.headers('Content-Length');
          if (contentLength > $scope.view.windowing.threshold && $scope.view.windowing.threshold !== -1) {
            $scope.view.windowing.show = true;
            handleError("File too large, automatic sliding window enabled.", "warning");
          }
          streamRemoteFile($scope.view.filePath);
        });
      } else {
        downloadFile($scope.view.filePath);
      }
    }, function() {
      downloadFile($scope.view.filePath);
    });
  };

  $scope.canDownload = function() {
    var pathParts = $scope.view.filePath.split("://");
    if ((pathParts[0] === "https" || pathParts[0] === "http") && pathParts.length > 1 && pathParts[1].length > 0) {
      return true;
    } else {
      return false;
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

  $scope.getLocalFile = function(event) {
    $scope.view.filePath = event.target.files[0].name;
    if (event.target.files[0].size > $scope.view.windowing.threshold && $scope.view.windowing.threshold !== -1) {
      $scope.view.windowing.show = true;
      handleError("File too large, automatic sliding window enabled.", "warning");
    }
    $scope.view.loading = true;
    streamLocalFile(event.target.files[0]);
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
      if (appConfig.BUFFER_SIZE !== -1 && loadedCSV.length > appConfig.BUFFER_SIZE) { // sliding window
        loadedCSV.shift();
        backupCSV.shift();
      }
      loadedCSV.push(arr);
      backupCSV.push(angular.extend([], arr));
    }
    if ($scope.view.graph === null) {
      renderGraph();
    } else {
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

  var downloadFile = function(url) {
    resetFields();
    Papa.parse(url, {
      download: true,
      skipEmptyLines: true,
      header: true,
      dynamicTyping: true,
      worker: false, // multithreaded, !but does NOT work with other libs in app.js or streaming
      comments: "#",
      complete: function(results) {
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
      error: function(error) {
        $scope.view.loading = false;
        handleError("Could not download file.", "danger");
      }
    });
  };

  var streamRemoteFile = function(url) {
    resetFields();
    Papa.RemoteChunkSize = appConfig.REMOTE_CHUNK_SIZE;
    var firstChunkComplete = false;
    Papa.parse(url, {
      download: true,
      skipEmptyLines: true,
      header: true,
      dynamicTyping: true,
      worker: false, // multithreaded, !but does NOT work with other libs in app.js or streaming
      comments: "#",
      chunk: function(chunk, parser) {
        if (!firstChunkComplete) {
          streamParser = parser;
          loadedFields = generateFieldMap(chunk.data, appConfig.EXCLUDE_FIELDS);
          firstChunkComplete = true;
        }
        loadData(chunk.data);
      },
      beforeFirstChunk: function(chunk) {
        $scope.view.loadedFileName = getRemoteFileName(url);
        var rows = chunk.split(/\r\n|\r|\n/);
        rows.splice(1, appConfig.HEADER_SKIPPED_ROWS);
        $scope.view.loading = false;
        return rows.join('\n');
      },
      //fastMode: true, // automatically enabled if no " appear
      error: function(error) {
        handleError("Could not stream file.", "danger");
        $scope.view.loading = false;
      }
    });
  };

  // read and parse a CSV file
  var streamLocalFile = function(file) {
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
        if (!firstChunkComplete) {
          streamParser = parser;
          loadedFields = generateFieldMap(chunk.data, appConfig.EXCLUDE_FIELDS);
          firstChunkComplete = true;
        }
        loadData(chunk.data);
      },
      beforeFirstChunk: function(chunk) {
        $scope.view.loadedFileName = file.name;
        var rows = chunk.split(/\r\n|\r|\n/);
        rows.splice(1, appConfig.HEADER_SKIPPED_ROWS);
        $scope.view.loading = false;
        return rows.join('\n');
      },
      //fastMode: true, // automatically enabled if no " appear
      error: function(error) {
        handleError(error, "danger");
        $scope.view.loading = false;
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
