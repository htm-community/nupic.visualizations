angular.module('app').directive('fieldOptions', function() {
  return {
    restrict: 'A',
    scope: false,
    template:
      '<td style="color:{{field.color}};"><div class="span-wrapper" uib-popover="{{field.name}}" popover-trigger="mouseenter" popover-animation="false"><span>{{field.name}}</span></div></td>' +
      '<td><input type="checkbox" ng-model="field.visible" ng-click="toggleVisibility(field)"></td>' +
      '<td><input type="checkbox" ng-model="field.highlighted" ng-click="updateHighlight(field)"></td>' +
      '<td><input type="text" class="form-control input-sm" ng-model="field.highlightThreshold" highlight-field="field" highlight-fn="updateHighlight"></td>' +
      '<td><input type="checkbox" ng-disabled="field.id === view.dataField || view.dataField === null" ng-model="field.normalized"></td>' +
      '<td><input type="radio" ng-disabled="field.normalized" ng-model="view.dataField" ng-value="{{field.id}}"></td>',
    link: function(scope, element, attrs) {
      var watchers = {};
      watchers.normalized = scope.$watch('field.normalized', function(newValue, oldValue) {
        if (newValue) {
          scope.normalizeField(scope.field.id);
        } else if (!newValue && newValue !== oldValue) {
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
