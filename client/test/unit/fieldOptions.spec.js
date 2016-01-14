describe('directive: fieldOptions', function() {
  var element,
    appConfig,
    $rootScope,
    $compile,
    $scope,
    $controller,
    $timeout;

  var viewMock = {
    fieldState: [{
      "name": "field1",
      "id": 0,
      "visible": true,
      "normalized": false,
      "value": null,
      "color": "rgb(0,0,0)",
      "highlighted": false,
      "highlightThreshold": null
    }, {
      "name": "field2",
      "id": 1,
      "visible": true,
      "normalized": false,
      "value": null,
      "color": "rgb(0,0,0)",
      "highlighted": false,
      "highlightThreshold": null
    },{
      "name": "field3",
      "id": 2,
      "visible": true,
      "normalized": false,
      "value": null,
      "color": "rgb(0,0,0)",
      "highlighted": false,
      "highlightThreshold": null
    },{
      "name": "field4",
      "id": 3,
      "visible": true,
      "normalized": false,
      "value": null,
      "color": "rgb(0,0,0)",
      "highlighted": false,
      "highlightThreshold": null
    },{
      "name": "field5",
      "id": 4,
      "visible": true,
      "normalized": false,
      "value": null,
      "color": "rgb(0,0,0)",
      "highlighted": false,
      "highlightThreshold": null
    },{
      "name": "field6",
      "id": 5,
      "visible": true,
      "normalized": false,
      "value": null,
      "color": "rgb(0,0,0)",
      "highlighted": false,
      "highlightThreshold": null
    },{
      "name": "field7",
      "id": 6,
      "visible": true,
      "normalized": false,
      "value": null,
      "color": "rgb(0,0,0)",
      "highlighted": false,
      "highlightThreshold": null
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
    element = '<tr field-options ng-repeat="field in view.fieldState track by field.name"></tr>';
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
