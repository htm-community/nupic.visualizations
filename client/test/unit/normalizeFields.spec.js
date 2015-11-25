describe('directive: fileUploadChange', function() {
  var element,
    appConfig,
    $rootScope,
    $compile,
    $scope,
    $controller,
    $timeout;

  var viewMock = {
    fieldState: [{
      "name": "reset",
      "id": 0,
      "visible": true,
      "normalized": false,
      "value": null,
      "color": "rgb(128,64,0)"
    }, {
      "name": "consumption",
      "id": 1,
      "visible": true,
      "normalized": false,
      "value": null,
      "color": "rgb(0,64,128)"
    }, {
      "name": "multiStepPredictions.actual",
      "id": 2,
      "visible": true,
      "normalized": false,
      "value": null,
      "color": "rgb(128,128,0)"
    }, {
      "name": "multiStepBestPredictions.actual",
      "id": 3,
      "visible": true,
      "normalized": false,
      "value": null,
      "color": "rgb(0,0,128)"
    }, {
      "name": "multiStepBestPredictions.1",
      "id": 4,
      "visible": true,
      "normalized": false,
      "value": null,
      "color": "rgb(64,128,0)"
    }, {
      "name": "multiStepBestPredictions.5",
      "id": 5,
      "visible": true,
      "normalized": false,
      "value": null,
      "color": "rgb(64,0,128)"
    }, {
      "name": "anomalyScore",
      "id": 6,
      "visible": true,
      "normalized": false,
      "value": null,
      "color": "rgb(0,128,0)"
    }, {
      "name": "multiStepBestPredictions:multiStep:errorMetric='aae':steps=1:window=1000:field=consumption",
      "id": 7,
      "visible": true,
      "normalized": false,
      "value": null,
      "color": "rgb(128,0,128)"
    }, {
      "name": "prediction:trivial:errorMetric='aae':steps=5:window=1000:field=consumption",
      "id": 8,
      "visible": true,
      "normalized": false,
      "value": null,
      "color": "rgb(0,128,64)"
    }, {
      "name": "multiStepBestPredictions:multiStep:errorMetric='aae':steps=5:window=1000:field=consumption",
      "id": 9,
      "visible": true,
      "normalized": false,
      "value": null,
      "color": "rgb(128,0,64)"
    }, {
      "name": "prediction:trivial:errorMetric='aae':steps=1:window=1000:field=consumption",
      "id": 10,
      "visible": true,
      "normalized": false,
      "value": null,
      "color": "rgb(0,128,128)"
    }],
    dataField : 2
  }

  beforeEach(module('app'));

  beforeEach(inject(function(_$rootScope_, _$compile_, _$controller_, _$timeout_, _appConfig_) {
    $rootScope = _$rootScope_;
    $controller = _$controller_;
    $compile = _$compile_;
    $timeout = _$timeout_;
    appConfig = _appConfig_;

    $scope = $rootScope.$new();
    appCtrl = $controller('appCtrl', {
      $scope: $scope,
      $timeout: $timeout,
      appConfig: appConfig
    });

    $scope.view = viewMock;
    spyOn($scope, 'normalizeField');
    spyOn($scope, 'denormalizeField');
    spyOn($scope, 'renormalize');
    element = '<tr normalize-fields ng-repeat="field in view.fieldState track by field.name"></tr>';
    element = $compile(element)($scope);

  }));

  describe('normalizeField', function() {
    beforeEach(function(){
      $scope.view.fieldState[6].normalized = true;
      $scope.$digest();
    });
    it("should have been called", function() {
      expect($scope.normalizeField.calls.count()).toBe(1);
      expect($scope.normalizeField).toHaveBeenCalledWith(6);
    });
  });

  describe('denormalizeField', function() {
    beforeEach(function(){
      $scope.view.fieldState[6].normalized = true;
      $scope.$digest();
      $scope.view.fieldState[6].normalized = false;
      $scope.$digest();
    });
    it("should have been called", function() {
      expect($scope.denormalizeField.calls.count()).toBe(1);
      expect($scope.denormalizeField).toHaveBeenCalledWith(6);
    });
  });

  describe('renormalize', function() {
    beforeEach(function(){
      $scope.view.dataField = 1;
      $scope.$digest();
    });
    it("should have been called", function() {
      expect($scope.renormalize).toHaveBeenCalled();
    });
  });

});
