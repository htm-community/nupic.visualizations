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
