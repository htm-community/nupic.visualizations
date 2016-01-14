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
  WINDOW_SIZE : 10000,
  // MAX_FILE_SIZE:
  // Maximum size in bytes, for a file. Over this size, and windowing will automatically occur. (default 60MB)
  // -1 to disable the functionality (can cause performance problems on large files/online monitoring)
  MAX_FILE_SIZE : 60*1024*1024,
  // LOCAL_CHUNK_SIZE:
  // in Bytes
  // size in bytes of each chunk for the data stream, when reading local files
  LOCAL_CHUNK_SIZE : 2*1024*1024,
  // REMOTE_CHUNK_SIZE:
  // in Bytes
  // size in bytes of each chunk for the data stream, when reading files over a network.
  REMOTE_CHUNK_SIZE : 65536,
  // POLLING_INTERVAL:
  // time interval (in ms) after which the source file is re-read to find possible updates. 
  // A value <= 0 means polling is disabled - nothing else happens after the end of the file is reached. 
  // Default: 0
  POLLING_INTERVAL : 5000,
  // HIGHLIGHT_RADIUS:
  // radius of threshold highlight from point in time that reaches the threshold.
  // modifies (together with color/opacity) how visible the highlight is.
  HIGHLIGHT_RADIUS : 10,
});
