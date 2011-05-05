// An class that wraps functions and ensures that it only calls them once the function has not been performed for an interval (a form of flood control).

logger = Components.utils.import("resource://socialite/utils/log.jsm");

var EXPORTED_SYMBOLS = ["Quantizer"];

function Quantizer(name, interval, sameFunc) {
  this.name = name;
  this.interval = interval;
  if (sameFunc) {
    this.sameFunc = sameFunc;
  } else {
    this.sameFunc = function() {return false};
  }
  
  this.waitingSet = [];
  this.timer = Components.classes["@mozilla.org/timer;1"]
               .createInstance(Components.interfaces.nsITimer);
  this.timerIsRunning = false;
}

Quantizer.prototype.quantize = function(func) {
  // Replace the call with a hook into the quantizer.
  var self = this;
  var quantized = function() {
    self.callQuantized(func, this, arguments);
  };
  
  return quantized;
}

// Called when an function is called
Quantizer.prototype.callQuantized = function(func, thisArg, args) {
  logger.log(this.name, "Received call request.");

  // Scan for an existing equivalent call, and replace it.
  for (var i=0; i<this.waitingSet.length; i++) {
    var entry = this.waitingSet[i];
    if (this.sameFunc(entry.func, entry.args, func, args)) {
      entry.func = func;
      entry.thisArg = thisArg;
      entry.args = args;
      entry.wasCalled = true;
      entry.isNew = false;
      return;
    }
  }

  // If an equivalent call was not found, create a new entry.
  // New unique calls get performed immediately, so that there is no delay.
  // This entry has isNew set, which means that we already called the function.
  // If the entry is not updated before the next tick, it will get removed.
  var entry = {
    func: func,
    thisArg: thisArg,
    args: args,
    wasCalled: false,
    isNew: true,
  }
  this.waitingSet.push(entry);
  this.performCall(entry);

  var self = this;
  if (!this.timerIsRunning) {
    this.timer.initWithCallback(
      function() {self.tick.apply(self)}, 
      this.interval,  
      this.timer.TYPE_REPEATING_SLACK
    );
    this.timerIsRunning = true;
  }
}

// Called when the timer ticks
Quantizer.prototype.performCall = function(entry) {
  logger.log(this.name, "Performing call");

  // Call the function
  entry.func.apply(entry.thisArg, entry.args);
}

// Called when the timer ticks
Quantizer.prototype.tick = function() {
  for (var i=0; i<this.waitingSet.length; i++) {
    var entry = this.waitingSet[i];
    
    // If the function wasn't called within the last interval, call it now.
    if (!entry.wasCalled) {
      // Remove the entry
      this.waitingSet.splice(i, 1);
      
      if (!entry.isNew) {
        this.performCall(entry);
      } 
    } else {
      logger.log(this.name, "Delaying call");
      // Reset the flag
      entry.wasCalled = false;
    }
  }
  
  // If nothing is left queued, stop the timer.
  if (this.waitingSet.length == 0) {
    this.timer.cancel();
    this.timerIsRunning = false;
  }
}
