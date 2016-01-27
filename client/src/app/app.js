angular.module('app', ['btford.socket-io','ui.bootstrap']);

angular.module('app').factory('socket', ['socketFactory', function(socketFactory){

  var mySocket = socketFactory();

  mySocket.on("connect", function(){
    console.log("Connected to server socket.");
  });

  mySocket.on("status", function(message){
    console.log(message.message);
  });
  /*
  mySocket.on("data", function(data) {
    console.log(data);
  });
  */
  return mySocket;

}]);

