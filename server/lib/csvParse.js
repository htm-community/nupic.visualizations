var nconf = require('nconf');
var babyparse = require('babyparse');

module.exports = function() {
  return function(req, res, next) {
    next();
  };
};
