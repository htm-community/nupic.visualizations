var gulp = require('gulp');

// jshint
var stylish = require('jshint-stylish');
var jshint = require('gulp-jshint');

// jasmine
// var jasmine = require('gulp-jasmine');

gulp.task('lint', function() {
  return gulp.src('./*.js')
    .pipe(jshint())
    .pipe(jshint.reporter(stylish));
});

gulp.task('default', ['lint']);