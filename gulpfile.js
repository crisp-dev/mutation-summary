/*
 * Project: Mutation Summary
 * Author: Baptiste Jamin https://crisp.chat/
 * Copyright: 2017, Crisp IM, Inc.
 */


var fs                    = require("fs");
var del                   = require("del");
var gulp                  = require("gulp");
var gulp_bower            = require("gulp-bower");
var gulp_typescript       = require("gulp-typescript");
var gulp_concat           = require("gulp-concat");

/*
  Installs bower packages
*/
gulp.task("bower", function() {
  return gulp_bower()
    .pipe(
      gulp.dest("./lib")
    );
});

/*
  Builds project
*/
gulp.task("typescript", function () {
    return  gulp.src("./src/*.ts")
      .pipe(gulp_typescript({}))
      .pipe(gulp.dest('./dist'));
});

/*
  Concats javascripts (libraries)
*/
gulp.task("concat_libraries", [
  "typescript",
], function() {
  return gulp.src([
    "./lib/lz-string/index.js",
    "./dist/tree-mirror.js"
  ])
  .pipe(gulp_concat("tree-mirror.js"))
  .pipe(gulp.dest("./dist"));;
});

/*
  Builds project
*/
gulp.task("build", function() {
  gulp.start(
    "typescript"
  );
  gulp.start(
    "concat_libraries"
  )
});


/*
  Entry point (default task)
*/
gulp.task("default", [
  "build"
]);
