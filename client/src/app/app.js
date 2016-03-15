angular.module('app', ['btford.socket-io','ui.bootstrap','toastr','ngAnimate']);

angular.module('app').config(['toastrConfig', function(toastrConfig) {
  angular.extend(toastrConfig, {
    positionClass: 'toast-top-full-width',
    preventOpenDuplicates: true,
  });
}]);

angular.module('app').factory('socket', ['socketFactory', 'toastr', function(socketFactory, toastr){

  var Socket = socketFactory();

  Socket.on("connect", function(){
    console.log("Connected to server socket.");
  });

  Socket.on("status", function(status){
    console.log(status.message);
  });

  Socket.on("errorMessage", function(error) {
    toastr.error(error.statusMessage);
    //console.warn(error.message); // TODO: handle different types of errors, and give the user feedback
  });

  Socket.on("fileRetrievalError", function(error){
    toastr.error(error.statusMessage);
    //console.error(error.statusCode, error.statusMessage);
  });

  return Socket;

}]);

