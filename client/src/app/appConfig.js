// some Settings:
angular.module('app').constant('appConfig', {
  // TIMESTAMP:
  // represents the name of the column with timestamp/x-data;
  // if field timestamp is used, try parsing as data, or numeric, or fallback to iteration. 
  TIMESTAMP : "timestamp",
  TIMESTAMP_FALLBACK : "__iter__", // no normal column should be named like this!
  // POSSIBLE_OPF_DATA_FIELDS:
  // Is used only in OPF files during CSV parsing, where fields may, or may not be present,
  // depending on the user's Model settings in NuPIC.
  // If these fields are present, we'll include them as data fields.
  // FIXME: is this code (and guessDataFields()) needed? 'multiStepBestPredictions.5' are
  // plotted even though not in the list.
  POSSIBLE_OPF_DATA_FIELDS : [
    "multiStepPredictions.actual",
    "multiStepBestPredictions.actual"
  ],
  // EXCLUDE_FIELDS:
  // used to ignore some fields completely, not showing them as possibilities in graph plots.
  EXCLUDE_FIELDS : [],
  // HEADER_SKIPPED_ROWS:
  // number of rows (between 2nd .. Nth, included) skipped.
  // For OPF this must be >= 2 (as 2nd row is 'float,float,float', 3rd: ',,' metadata)
  // You can increase this (to about 2000) to skip untrained HTM predictions at the beginning
  // (eg. data where anomalyScore = 0.5 at the start).
  // Warning: default 2 is used, so for non-OPF data you lose the first 2 data points
  // (we find that acceptable).
  HEADER_SKIPPED_ROWS : 2,
  // ZOOM:
  // toggle 2 methods of zooming in the graph: "RangeSelector", "HighlightSelector" (=mouse)
  ZOOM : "HighlightSelector",
  // NONE_VALUE_REPLACEMENT:
  // used to fix a "bug" in OPF, where some columns are numeric
  // (has to be determined at the last row), but their first few values are "None".
  // We replace the with this value, defaults to 0.
  NONE_VALUE_REPLACEMENT : 0,
});
