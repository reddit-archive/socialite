// Object-oriented action handler glue

logger = Components.utils.import("resource://socialite/utils/log.jsm");
Components.utils.import("resource://socialite/utils/hitch.jsm");

var EXPORTED_SYMBOLS = ["Action", "ActionType"];

let ActionConstructorMethodProto = {
  // Actions will use whatever "this" is set to when they are called. Use this method to create a reference to an action with a static value of "this".
  bind: function(thisObj) {
    bound = hitchThis(thisObj, this);
    bound.actionClass = this.actionClass;
    bound.actionPrototype = this.actionPrototype;
    return bound;
  }
}
ActionConstructorMethodProto.__proto__ = Function.prototype;

function Action(name, func) {
  // Create a new object "class" for this action
  var ActionClass = function(){};

  // Give all instantiated actions the common parent class and set base properties
  ActionClass.prototype = {name:name, func:func};
  ActionClass.prototype.__proto__ = ActionType.prototype;
  
  // Method to instantiate a new action, binding it to the object the method was called on
  var ActionConstructorMethod = function(successCallback, failureCallback, finallyCallback) {
    var action = new ActionClass();
    
    action.thisObj = this;
    action.successCallback = successCallback;
    action.failureCallback = failureCallback;
    action.finallyCallback = finallyCallback;
    action.startTime = null;
    
    return action;
  }
  
  ActionConstructorMethod.__proto__ = ActionConstructorMethodProto;
  // To modify the action class after the fact, we'll create a property on the constructor
  ActionConstructorMethod.actionClass = ActionClass;
  ActionConstructorMethod.actionPrototype = ActionClass.prototype;
  
  return ActionConstructorMethod;
}

function ActionType() {}
ActionType.prototype = {
  perform: function() {
    logger.log("action", "Performing " + this.name + " action");
  
    this.startTime = Date.now();
    
    var argArray = Array.prototype.splice.call(arguments, 0) || [];
  
    // Copy and store the array
    this.lastArgs = argArray.concat();
    
    // Add this action object to the end of the arguments list and call.
    var newargs = this.addToArgs(argArray);
    return this.func.apply(this.thisObj, newargs);
  },
  
  addToArgs: function(args) {
    // Arguments contain the arguments passed to this function, with this action object at the end.
    var newargs = args ? Array.prototype.splice.call(args, 0) : [];
    if ((newargs.length == 0) || (newargs[newargs.length-1] != this)) {
      newargs.push(this);
    }
    return newargs;
  },
  
  doCallback: function(callback, args) {
    // Arguments contain the arguments passed to this function, with this action object at the end.
    var newargs = this.addToArgs(args);
    
    if (callback) {
      // A little sugar to allow actions to be passed in without calling toFunction()
      if (callback instanceof ActionType) {
        return callback.perform.apply(callback, newargs);
      } else {
        return callback.apply(null, newargs);
      }
    }
  },
  
  success: function() {
    logger.log("action", this.name + " succeeded");
    let result = this.doCallback(this.successCallback, arguments);
    this.doCallback(this.finallyCallback);
    return result;
  },
  
  failure: function() {
    logger.log("action", this.name + " failed");
    let result = this.doCallback(this.failureCallback, arguments);
    this.doCallback(this.finallyCallback);
    return result;
  },
  
  toFunction: function() {
    return hitchThis(this, this.perform);
  },
  
  chainSuccess: function() {
    return hitchThis(this, this.success);
  },
  
  chainFailure: function() {
    return hitchThis(this, this.failure);
  },
  
  chainTo: function(action) {
    this.successCallback = function() {action.success.apply(action, arguments)};
    this.failureCallback = function() {action.failure.apply(action, arguments)};
    
    return;
  }
}
