describe('appCtrl', function () {

  var $rootScope,
      $controller,
      $timeout,
      appConfig,
      $scope,
      socketFactory,
      socket,
      mockIoSocket,
      appCtrl;

  beforeEach(module('app'));
  beforeEach(module('btford.socket-io'));

  beforeEach(inject(function(_$rootScope_, _$controller_, _$timeout_, _appConfig_, _socketFactory_){
    $rootScope = _$rootScope_;
    $controller = _$controller_;
    appConfig = _appConfig_;
    socketFactory = _socketFactory_;
    $scope = $rootScope.$new();
    mockIoSocket = io.connect();
    socket = socketFactory({
      ioSocket: mockIoSocket,
      scope: $scope
    });
    appCtrl = $controller('appCtrl', {
      $scope : $scope,
      $timeout : $timeout,
      appConfig : appConfig,
      socket : socket
    });
  }));

  describe('toggleOptions', function() {
    it('options should not be visible', function() {
      $scope.toggleOptions();
      expect($scope.view.optionsVisible).toBe(false);
    });
  });

  /* more to come... */

});
