angular.module('app').directive('highlightField', [function() {

  return {
    restrict: 'A',
    scope: {
      highlightFn : "=",
      highlightField : "="
    },
    link: function(scope, element, attrs) {
      element.bind("keyup", function (event) {
        scope.highlightFn(scope.highlightField);
      });
      scope.$on("$destroy", function(){
        element.unbind("keyup");
      });
    }
  };
}]);
