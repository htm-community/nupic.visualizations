angular.module('app').directive('fileUploadChange', function() {
  return {
    restrict: 'A',
    link: function(scope, element, attrs) {
      var onChangeHandler = scope.$eval(attrs.fileUploadChange);
      element.bind('change', onChangeHandler);
      scope.$on("$destroy", function() {
        element.unbind();
      });
    }
  };
});
