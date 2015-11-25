describe('directive: fileUploadChange', function() {
  var element,
      appConfig,
      $rootScope,
      $compile,
      $scope,
      $controller,
      $timeout;

  beforeEach(module('app'));

  beforeEach(inject(function(_$rootScope_, _$compile_, _$controller_, _$timeout_, _appConfig_) {
    $rootScope = _$rootScope_;
    $controller = _$controller_;
    $compile = _$compile_;
    $timeout = _$timeout_;
    appConfig = _appConfig_;

    $scope = $rootScope.$new();
    appCtrl = $controller('appCtrl', {
      $scope : $scope,
      $timeout : $timeout,
      appConfig : appConfig
    });
    spyOn($scope, 'uploadFile');
    element = '<input type="file" file-upload-change="uploadFile">';
    element = $compile(element)($scope);
    element.triggerHandler('change');
  }));

  describe('uploadFile', function() {
    it("should have been called", function() {
      expect($scope.uploadFile).toHaveBeenCalled();
    });
  });

});
