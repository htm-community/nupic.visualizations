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

