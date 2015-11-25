describe('appCtrl', function () {

  var $rootScope,
      $controller,
      $timeout,
      appConfig,
      $scope,
      appCtrl;

  beforeEach(module('app'));

  beforeEach(inject(function(_$rootScope_, _$controller_, _$timeout_, _appConfig_){
    $rootScope = _$rootScope_;
    $controller = _$controller_;
    appConfig = _appConfig_;
    $scope = $rootScope.$new();
    appCtrl = $controller('appCtrl', {
      $scope : $scope,
      $timeout : $timeout,
      appConfig : appConfig
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
