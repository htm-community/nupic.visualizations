angular.module('app').directive('fileUploadChange', function() {
  return {
    restrict: 'A',
    link: function(scope, element, attrs) {
      var onChangeHandler = scope.$eval(attrs.fileUploadChange);
      element.on('change', onChangeHandler);
      var listener = scope.$on("fileUploadChange", function(){
        angular.element(element).val(null);
      });
      scope.$on("$destroy", function() {
        element.off();
        listener();
      });
    }
  };
});
