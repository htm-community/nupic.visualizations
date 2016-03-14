angular.module('app', ['btford.socket-io','ui.bootstrap','toastr','ngAnimate']);

angular.module('app').config(['toastrConfig', function(toastrConfig) {
  angular.extend(toastrConfig, {
    positionClass: 'toast-top-center',
    preventOpenDuplicates: true,
  });
}]);

angular.module('app').factory('socket', ['socketFactory', function(socketFactory){

  var Socket = socketFactory();

  Socket.on("connect", function(){
    console.log("Connected to server socket.");
  });

  Socket.on("status", function(status){
    console.log(status.message);
  });

  Socket.on("errorMessage", function(error) {
    console.warn(error.message); // TODO: handle different types of errors, and give the user feedback
  });

  Socket.on("fileRetrievalError", function(error){
    console.error(error.statusCode, error.statusMessage);
  });

  return Socket;

}]);


// some Settings:
angular.module('app').constant('appConfig', {
  // TIMESTAMP:
  // represents the name of the column with timestamp/x-data;
  // if field timestamp is used, try parsing as data, or numeric, or fallback to iteration.
  TIMESTAMP : "timestamp",
  // EXCLUDE_FIELDS:
  // used to ignore some fields completely, not showing them as possibilities in graph plots.
  EXCLUDE_FIELDS : [],
  // HEADER_SKIPPED_ROWS:
  // number of rows (between 2nd .. Nth, included) skipped.
  // For OPF this must be >= 3 (as 2nd row is 'float,float,float', 3rd: ',,' metadata)
  // Tip: You can increase this (to about 2000) to skip untrained HTM predictions at the beginning
  // (eg. data where anomalyScore = 0.5 at the start).
  HEADER_SKIPPED_ROWS : 1,
  // ZOOM:
  // toggle 2 methods of zooming in the graph: "RangeSelector", "HighlightSelector" (=mouse)
  ZOOM : "HighlightSelector",
  // NONE_VALUE_REPLACEMENT:
  // used to fix a "bug" in OPF, where some columns are numeric
  // (has to be determined at the last row), but their first few values are "None".
  // We replace the with this value, defaults to 0.
  NONE_VALUE_REPLACEMENT : 0,
  // WINDOW_SIZE:
  // controls windowing functionality,
  // buffer size (in rows/items) used for DyGraph streaming, default 10000
  // each batch existing values are dropped, new WINDOW_SIZE is painted. Graph will "move to the right".
  // -1 : data never dropped, just append. Graph will "shrink".
  WINDOW_SIZE : 5000,
  // MAX_FILE_SIZE:
  // Maximum size in bytes, for a file. Over this size, and windowing will automatically occur. (default 60MB)
  // -1 to disable the functionality (can cause performance problems on large files/online monitoring)
  MAX_FILE_SIZE : 60*1024*1024,
  // LOCAL_CHUNK_SIZE:
  // size in bytes of each chunk for the data stream, when reading local files
  LOCAL_CHUNK_SIZE : 65536,
  // REMOTE_CHUNK_SIZE:
  // size in bytes of each chunk for the data stream, when reading files over a network. Not currently used.
  REMOTE_CHUNK_SIZE : 65536,
  // HIGHLIGHT_RADIUS:
  // radius of threshold highlight from point in time that reaches the threshold.
  // modifies (together with color/opacity) how visible the highlight is.
  HIGHLIGHT_RADIUS : 10,

  FIRST_VIEW_SIZE : 500000
});

// Web UI:

angular.module('app').controller('appCtrl', ['$scope', '$http', '$timeout', '$interval', 'appConfig', 'socket', 'toastr', function($scope, $http, $timeout, $interval, appConfig, socket, toastr) {

  $scope.view = {
    fieldState: [],
    graph: null,
    dataField: null,
    optionsVisible: true,
    filePath: "",
    loadedFileName: "",
    errors: [],
    loading: false,
    playing: false,
    windowing: {
      threshold: appConfig.MAX_FILE_SIZE,
      size: appConfig.WINDOW_SIZE, // changed to WINDOW_SIZE on 'windowing' / large files. //TODO add UI for this?
      show: false,
      paused: false,
      aborted: false,
      update_interval: 1, //FIXME Math.round(appConfig.WINDOW_SIZE / 10.0), //every N rows render (10% change)
    }
  };

  var loadedCSV = [],
    loadedFields = [], //=CSV header (parsed)
    backupCSV = [],
    timers = {},
    intervals = {},
    useIterationsForTimestamp = false,
    iteration = 0,
    resetFieldIdx = -1,
    streamParser = null,
    firstDataLoaded = false,
    fileSize = 0,
    firstGoodByte = 0,
    columns = null,
    lastGoodByte = 0,
    timestamps = []; // for testing

  // what to do when data is sent from server
  socket.on('data', function(data){
    //console.log("From server: firstGoodByte: ", data.firstGoodByte, "lastGoodByte: ", data.lastGoodByte);
    // check for duplicate timestamps
    /*
    for (var i = 0; i < data.rows.length; i++) {
      if (timestamps.indexOf(data.rows[i].timestamp) !== -1) {
        console.warn("Duplicate timestamp!", data.rows[i].timestamp);
      } else {
        timestamps.push(data.rows[i].timestamp);
      }
    }
    */
    fileSize = data.fileSize;
    //firstGoodByte = data.firstGoodByte;
    //lastGoodByte = data.lastGoodByte;
    columns = data.columns;
    if (!firstDataLoaded) {
      loadedFields = generateFieldMap(data.rows, appConfig.EXCLUDE_FIELDS);
      data.rows.splice(1, appConfig.HEADER_SKIPPED_ROWS);
      firstDataLoaded = true;
      loadData(data.rows);
    } else {
      loadData(data.rows);
    }
    /*
    if ($scope.view.playing) {
      timers.play = $timeout(function(){
        if (lastGoodByte + appConfig.PLAY_INCREMENT < fileSize) {
          var end = Math.min((lastGoodByte + appConfig.PLAY_INCREMENT),fileSize);
          console.log("Asking server: start: ", lastGoodByte, "end: ", end);
          socket.emit('readLocalFile', {
            path : $scope.view.filePath,
            start : lastGoodByte,
            end : end,
            columns : columns
          });
        } else {
          $timeout.cancel(timers.play);
          $scope.view.playing = false;
        }
      },500);
    }*/
  });

  var resetFields = function() {
    $scope.view.fieldState.length = 0;
    $scope.view.graph = null;
    $scope.view.dataField = null;
    $scope.view.errors.length = 0;
    $scope.view.loadedFileName = "";
    useIterationsForTimestamp = false;
    iteration = 0;
    loadedCSV.length = 0;
    loadedFields.length = 0;
    firstDataLoaded = false;
    fileSize = 0;
    firstGoodByte = 0;
    lastGoodByte = 0;
    columns = null;
    timestamps.length = 0;
  };

  /*
  socket.on('finish', function(){
    if (!firstDataLoaded) {
      loadedFields = generateFieldMap(firstRows, appConfig.EXCLUDE_FIELDS);
      firstRows.splice(1, appConfig.HEADER_SKIPPED_ROWS);
      firstDataLoaded = true;
      loadData(firstRows);
    }
  });


  socket.on('fileStats', function(stats){
    socket.emit('getLocalFile', {
      path : $scope.view.filePath,
      start : 0,
      end : stats.size
    });
  });
    */
  // the "Show/Hide Options" button
  $scope.toggleOptions = function() {
    $scope.view.optionsVisible = !$scope.view.optionsVisible;
    if ($scope.view.graph) {
      timers.resize = $timeout(function() {
        $scope.view.graph.resize();
      });
    }
  };

  $scope.getFile = function() {
    resetFields();
    if(isLocal()) {
      socket.emit('readLocalFile', {
        path : $scope.view.filePath,
        byteLimit : appConfig.FIRST_VIEW_SIZE,
        columns : columns
      });
      //socket.emit('getLocalFile', {path : $scope.view.filePath});
    } else if (isRemote()) {
      socket.emit('getRemoteFile', {url : $scope.view.filePath});
    }
    setFileTitle();
  };

  var setFileTitle = function() {
    var parts = $scope.view.filePath.split('/');
    $scope.view.loadedFileName = parts[parts.length - 1];
  };

  $scope.play = function() {
    $scope.view.playing = true;
    //var end = Math.min((lastGoodByte + appConfig.PLAY_INCREMENT),fileSize);
    socket.emit('playLocalFile', {
      path : $scope.view.filePath,
      speed : appConfig.PLAY_SPEED
    });
  };

  $scope.pause = function() {
    $scope.view.playing = false;
    socket.emit('pauseLocalFile');
  };

  $scope.validPath = function() {
    if (isRemote() || isLocal()) {
      return true;
    }
    return false;
  };

  var isRemote = function() {
    var urlParts = $scope.view.filePath.split("://");
    if (urlParts.length > 1) {
      var tldParts = urlParts[1].split(".");
      if ((urlParts[0] === "https" || urlParts[0] === "http") && tldParts.length > 1 && tldParts[1].length > 0) {
        return true;
      }
    }
    return false;
  };

  var isLocal = function() {
    var pathParts = $scope.view.filePath.split("/");
    if (pathParts.length > 1 && pathParts[0].length < 1 && pathParts[1].length > 0) {
      return true;
    }
    return false;
  };

  var loadData = function(data) {
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

  // show errors as "notices" in the UI
  var handleError = function(message, type, showOnce) {
    switch (type) {
      case "info" :
        toastr.info(message);
        break;
      case "warning" :
        toastr.warning(message);
        break;
      case "danger" :
        toastr.error(message);
        break;
      default :
        toastr.info(message);
    }
    /*
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
    */
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
    var header = [];
    angular.forEach(rows[0], function(value, key){
      header.push(key);
    });
    // OPF
    var OPFmeta = [];
    angular.forEach(rows[1], function(value, key){
      OPFmeta.push(value);
    });
    var isOPF = true; //determine OPF by having only meta chars at 3rd row (not numeric, unlike normal data)
    for (var i = 0; i < OPFmeta.length; i++) {
      if (typeof(OPFmeta[i]) === "number") {
        isOPF = false;
      } else if (OPFmeta[i] === 'R' || OPFmeta[i] === 'r') {
        resetFieldIdx = i;
      }
    }
    if (isOPF) {
      console.log("Detected OPF/NuPIC file.");
      appConfig.HEADER_SKIPPED_ROWS = 2; //default for OPF
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
    var headerFields = [];
    angular.forEach(rows[rows.length -1], function(value, key) {
      if ((typeof(value) === "number") && excludes.indexOf(key) === -1) {
        headerFields.push(key);
      }
    });

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
    angular.forEach(intervals, function(interval){
      $interval.cancel(interval);
    });
  });

  var highlightAnomaly = function(canvas, area, g) {
    /* draws a line for the threshold
    canvas.fillStyle = "#C4F605";
    var thresh = g.toDomYCoord(CONFIG.ANOMALY_THRESHOLD,1);
    canvas.fillRect(area.x, thresh, area.w, 1);
    */

    var timeIdx = 0;

    // draw rectangle on x0..x1
    function highlight_period(x_start, x_end, color) {
      var width = x_end - x_start;
      canvas.fillStyle = color;
      canvas.fillRect(x_start, area.y, width, area.h);
    }

    for (var i = 0; i < $scope.view.fieldState.length; i++) {
      var start,
        end,
        first,
        last,
        color,
        field,
        fieldIndex,
        threshold,
        transparency,
        previousIndex;

      if ($scope.view.fieldState[i].highlighted === true && $scope.view.fieldState[i].highlightThreshold !== null) {
        field = $scope.view.fieldState[i];
        fieldIndex = loadedFields.indexOf(field.name);
        if (fieldIndex < 0) {
          return;
        }
        color = field.color.replace("rgb", "rgba").replace(")", ",0.5)");
        start = null;
        end = null;
        last = null;
        first = null;
        for (var t = 0; t < loadedCSV.length; t++) {
          if (loadedCSV[t][fieldIndex] >= field.highlightThreshold && start === null) {
            start = g.toDomXCoord(loadedCSV[t][0]);
            first = t;
          }
          if (loadedCSV[t][fieldIndex] >= field.highlightThreshold) {
            last = t;
          }
          if (start !== null && (loadedCSV[t][fieldIndex] < field.highlightThreshold || t >= loadedCSV.length - 1)) {
            // get leading slope
            if (t === last) {
              end = g.toDomXCoord(loadedCSV[last][0]);
            } else {
              var x1 = g.toDomXCoord(loadedCSV[t][0]) - g.toDomXCoord(loadedCSV[last][0]);
              var y1 = loadedCSV[last][fieldIndex] - loadedCSV[t][fieldIndex];
              var z = Math.atan(x1 / y1);
              var y2 = loadedCSV[last][fieldIndex] - field.highlightThreshold;
              var x2 = y2 * Math.tan(z);
              end = g.toDomXCoord(loadedCSV[last][0]) + x2;
            }
            // get trailing slope
            previousIndex = first - 1;
            if (previousIndex >= 0) {
              var x3 = start - g.toDomXCoord(loadedCSV[previousIndex][0]);
              var y3 = loadedCSV[first][fieldIndex] - loadedCSV[previousIndex][fieldIndex];
              var z2 = Math.atan(x3 / y3);
              var y4 = loadedCSV[first][fieldIndex] - field.highlightThreshold;
              var x4 = y4 * Math.tan(z2);
              start = start - x4;
            }
            highlight_period(start, end, color);
            start = null;
            end = null;
            last = null;
            first = null;
          }
        }
      }
    }
  };

}]);

angular.module('app').directive('fieldOptions', function() {
  return {
    restrict: 'A',
    scope: false,
    template:
      '<td style="color:{{field.color}};"><div class="span-wrapper" uib-popover="{{field.name}}" popover-trigger="mouseenter" popover-animation="false"><span>{{field.name}}</span></div></td>' +
      '<td><input type="checkbox" ng-model="field.visible" ng-click="toggleVisibility(field)"></td>' +
      '<td><input type="checkbox" ng-model="field.highlighted" ng-click="updateHighlight(field)"></td>' +
      '<td><input type="text" class="form-control input-sm" ng-model="field.highlightThreshold" highlight-field="field" highlight-fn="updateHighlight"></td>' +
      '<td><input type="checkbox" ng-disabled="field.id === view.dataField || view.dataField === null" ng-model="field.normalized"></td>' +
      '<td><input type="radio" ng-disabled="field.normalized" ng-model="view.dataField" ng-value="{{field.id}}"></td>',
    link: function(scope, element, attrs) {
      var watchers = {};
      watchers.normalized = scope.$watch('field.normalized', function(newValue, oldValue) {
        if (newValue) {
          scope.normalizeField(scope.field.id);
        } else if (!newValue && newValue !== oldValue) {
          scope.denormalizeField(scope.field.id);
        }
      });
      watchers.isData = scope.$watch('view.dataField', function() {
        scope.renormalize();
      });
      scope.$on("$destroy", function() {
        angular.forEach(watchers, function(watcher) {
          watcher();
        });
      });
    }
  };
});

angular.module('app').directive('fileUploadChange', function() {
  return {
    restrict: 'A',
    link: function(scope, element, attrs) {
      var onChangeHandler = scope.$eval(attrs.fileUploadChange);
      element.on('change', onChangeHandler);
      var listener = scope.$on("fileUploadChange", function(){
        angular.element(element).val(null);
      });
      scope.$on("$destroy", function() {
        element.off();
        listener();
      });
    }
  };
});

angular.module('app').directive('highlightField', [function() {

  return {
    restrict: 'A',
    scope: {
      highlightFn : "=",
      highlightField : "="
    },
    link: function(scope, element, attrs) {
      element.bind("keyup", function (event) {
        scope.highlightFn(scope.highlightField);
      });
      scope.$on("$destroy", function(){
        element.unbind("keyup");
      });
    }
  };
}]);

angular.module('app').filter('bytes', function() {
  return function(bytes, precision) {
    if (isNaN(parseFloat(bytes)) || !isFinite(bytes)) return '-';
    if (typeof precision === 'undefined') precision = 1;
    var units = ['bytes', 'kB', 'MB', 'GB', 'TB', 'PB'],
      number = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, Math.floor(number))).toFixed(precision) +  ' ' + units[number];
  };
});

angular.module('uploadFile', []).factory('UploadFile', ['$http', function ($http){

  var onSuccess = function() {

  };

  var onError = function() {

  };

  var service = {

    getLocalFile : function(filePath, scb, ecb) {
      scb = scb || onSuccess;
      ecb = ecb || onError;
      $http.get("/local" + filePath).then(scb, ecb);
    }

  };

  return service;

}]);
