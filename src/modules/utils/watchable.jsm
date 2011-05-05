var EXPORTED_SYMBOLS = ["Watchable"];

function Watchable() {
  this.watches = [];
}
Watchable.prototype = {
  watch: function(callback) {
    let index = this.watches.length;
    this.watches.push(callback);
    
    let self = this;
    function removeFunction() {
      self.watches.splice(index, 1);
    }
    return removeFunction;
  },
  
  get count() {
    return this.watches.length;
  },
  
  send: function() {
    let args = arguments;
    this.watches.forEach(function(callback) {
      callback.apply(null, args);
    });
  }
};
