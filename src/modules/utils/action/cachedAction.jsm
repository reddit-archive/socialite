// An action that caches an action's result, refreshing it when it expires

logger = Components.utils.import("resource://socialite/utils/log.jsm");
Components.utils.import("resource://socialite/utils/action/action.jsm");

var EXPORTED_SYMBOLS = ["CachedAction"];

function CachedAction(updateAction, expireSeconds) {
  let updateActionName = updateAction.actionClass.prototype.name;
  let cachedAction = Action(updateActionName+".cache", _cachedAction);
  
  let actionPrototype = cachedAction.actionPrototype;
  actionPrototype.updateAction = updateAction;
  actionPrototype.cachedValue = new CachedValue(cachedAction, expireSeconds);
  cachedAction.cachedValue = actionPrototype.cachedValue;
  
  return cachedAction;
}

function _cachedAction(action) {
  if (action.cachedValue.isValid) {
    action.success.apply(action, action.cachedValue.value);
  } else {
    action.updateAction.call(this,
      function success() {
        action.cachedValue.updated.apply(action.cachedValue, arguments);
        action.success.apply(action, arguments);
      },
      action.chainFailure()
    ).perform()
  }
}

function CachedValue(action, expireSeconds) {
  this.action = action;
  this.expireSeconds = expireSeconds
  this._value = false;
}
CachedValue.prototype = {
  get actionName() {
    return this.action.actionPrototype.name;
  },
  
  get value() {
    return this._value;
  },
  
  get hasValue() {
    return this.value != false;
  },
  
  get isExpired() {
    let elapsed = Date.now() - this.lastUpdated;
    return this.expireSeconds != false && elapsed >= this.expireSeconds*1000;
  },
  
  get isValid() {
    return this.hasValue && !this.isExpired;
  },
    
  updated: function() {
    logger.log("cachedaction", this.actionName + " updated")
    this._value = arguments;
    this.lastUpdated = Date.now();
  },

  reset: function() {
    logger.log("cachedaction", this.actionName + " reset")
    this._value = false;
  }
};