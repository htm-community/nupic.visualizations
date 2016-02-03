angular.module('app', ['btford.socket-io','ui.bootstrap']);

angular.module('app').factory('socket', ['socketFactory', function(socketFactory){

  var mySocket = socketFactory();

  mySocket.on("connect", function(){
    console.log("Connected to server socket.");
  });

  mySocket.on("status", function(status){
    console.log(status.message);
  });

  mySocket.on("errorMessage", function(error) {
    console.error(error.message); // TODO: handle different types of errors, and give the user feedback
  });

  return mySocket;

}]);

