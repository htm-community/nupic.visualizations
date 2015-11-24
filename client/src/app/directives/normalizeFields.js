angular.module('app').directive('normalizeFields', function() {
  return {
    restrict: 'A',
    scope: false,
    template: '<td><input type="checkbox" ng-disabled="field.id === view.dataField || view.dataField === null" ng-model="field.normalized"></td>' +
      '<td><input type="radio" ng-disabled="field.normalized" ng-model="view.dataField" ng-value="{{field.id}}"></td>',
    link: function(scope, element, attrs) {
      var watchers = {};
      watchers.normalized = scope.$watch('field.normalized', function(newValue, oldValue) {
        if (newValue) {
          scope.normalizeField(scope.field.id);
        } else {
          scope.denormalizeField(scope.field.id);
        }
      });
      watchers.isData = scope.$watch('view.dataField', function() {
        scope.renormalize();
      });
      scope.$on("$destroy", function() {
        angular.forEach(watchers, function(watcher) {
          watcher();
        });
      });
    }
  };
});
