var gulp = require('gulp');
var stylish = require('jshint-stylish');
var jshint = require('gulp-jshint');
var uglify = require('gulp-uglify');
var concat = require('gulp-concat');
var less = require('gulp-less');
var path = require('path');
var minifyCSS = require('gulp-minify-css');
var del = require('del');
var karmaServer = require('karma').Server;

var appName = "nupic-visualizations";

var appJS = [
  "client/src/app/**/*.js"
];

var externalJS = [
  "client/bower_components/angular/angular.min.js",
  "client/bower_components/angular-bootstrap/ui-bootstrap-tpls.min.js",
  "client/bower_components/dygraphs/dygraph-combined.js",
  "client/bower_components/moment/min/moment.min.js",
  "client/bower_components/papaparse/papaparse.min.js"
];

gulp.task('default', ['test','build']);

gulp.task('build', ['externaljs', 'appjs', 'less', 'static']);

gulp.task('clean', function() {
  return del(['build/*']);
});

gulp.task('appjs', ['clean'], function() {
  return gulp.src(appJS)
    .pipe(jshint())
    .pipe(jshint.reporter('default'))
    .pipe(concat('app.js'))
    .pipe(uglify())
    .pipe(gulp.dest('build'));
});

gulp.task('externaljs', ['clean'], function() {
  return gulp.src(externalJS)
    .pipe(concat("external.js"))
    .pipe(gulp.dest('build'));
});

gulp.task('less', ['clean'], function() {
  return gulp.src('client/src/less/stylesheet.less')
    .pipe(less({
      paths: [
        path.join(__dirname, 'client', 'bower_components', 'bootstrap', 'less'),
        path.join(__dirname, 'client', 'src', 'less')
      ]
    }))
    .pipe(minifyCSS())
    .pipe(gulp.dest('build'));
});

var files = [
  'client/src/index.html',
  'client/src/assets/*'
];

var fonts = ['client/bower_components/bootstrap/fonts/*'];

gulp.task('static', ['assets', 'fonts']);

gulp.task('assets', ['clean'], function(){
  return gulp.src(files)
    .pipe(gulp.dest('build'))
});

gulp.task('fonts', ['clean'], function(){
  return gulp.src(fonts)
    .pipe(gulp.dest('build/fonts'))
});

gulp.task('test', function (done) {
  new karmaServer({
    configFile: __dirname + '/client/test/karma.conf.js',
    singleRun: true
  }, done).start();
});

// add banner?
