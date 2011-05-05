logger = Components.utils.import("resource://socialite/utils/log.jsm");

var EXPORTED_SYMBOLS = ["ActiveInterval", "PreferenceActiveInterval"];

let idleService = Components.classes["@mozilla.org/widget/idleservice;1"]
                                     .getService(Components.interfaces.nsIIdleService)

preferences = Components.classes["@mozilla.org/preferences-service;1"]
                                           .getService(Components.interfaces.nsIPrefService)
                                           .getBranch("");
preferences.QueryInterface(Components.interfaces.nsIPrefBranch2);

function ActiveInterval(callback, interval, idleThreshold) {
  this.callback = callback;
  this.interval = interval;
  
  if (idleThreshold !== undefined) {
    this.idleThreshold = idleThreshold;
  } else {
    this.idleThreshold = 60*5; // 10 minutes
  }
  
  // Instantiate an observer for the idle service
  let self = this;
  this.idleObserver = {
    observe: function(subject, topic, data) {
      switch (topic) {
        case "idle":
          logger.log("activeinterval", "User idle; pausing interval")
          self._stop_ticking();
          break;
          
        case "back":
          logger.log("activeinterval", "User back; resuming interval")
          self.tick();
          self._start_ticking();
          break;
      }
    }
  };
  
  // Instantiate a timer
  this.timer = Components.classes["@mozilla.org/timer;1"]
                                  .createInstance(Components.interfaces.nsITimer);
  this.isTicking = false;
  this.isRunning = false;
}
ActiveInterval.prototype = {
  start: function() {
    if (!this.isRunning) {
      idleService.addIdleObserver(this.idleObserver, this.idleThreshold);
      this._start_ticking();
      this.isRunning = true;
    }
  },
  
  stop: function() {
    if (this.isRunning) {
      idleService.removeIdleObserver(this.idleObserver, this.idleThreshold);
      this._stop_ticking();
      this.isRunning = false;
    }
  },
  
  reset: function() {
    if (this.isTicking) {
      this._start_ticking();
    }
  },
  
  setInterval: function(interval) {
    this.interval = interval;
    if (this.isTicking) {
      this.timer.delay = this._get_timer_interval();
    }
  },
  
  _get_timer_interval: function() {
    return this.interval*1000;
  },
  
  _start_ticking: function() {
    let self = this;
    this.timer.initWithCallback(
      function() {self.tick();},
      this._get_timer_interval(),
      this.timer.TYPE_REPEATING_SLACK
    );
    this.isTicking = true;
  },
  
  _stop_ticking: function() {
    this.timer.cancel();
    this.isTicking = false;
  },
  
  tick: function() {
    this.callback();
  },
};

function PreferenceActiveInterval(callback, intervalPreference, enabledPreference, minimumInterval, idleThreshold) {
  this.intervalPreference = intervalPreference;
  this.enabledPreference = enabledPreference;
  this.minimumInterval = minimumInterval;
  this.isStarted = false;
  ActiveInterval.call(this, callback, this.prefInterval, idleThreshold);
  
  let self = this;
  this.preferenceObserver = {
    
    observe: function(subject, topic, data) {
      switch (data) {
        
        case self.enabledPreference:
          self.updateEnabled();
          break;
          
        case self.intervalPreference:
          self.updateInterval();
          break;
          
      }
    }
  
  }
  preferences.addObserver("", this.preferenceObserver, false);
}
PreferenceActiveInterval.prototype = {
  start: function() {
    this.isStarted = true;
    ActiveInterval.prototype.start.call(this);
  },

  stop: function() {
    this.isStarted = false;
    ActiveInterval.prototype.stop.call(this);
  },
  
  destroy: function() {
    this.stop();
    preferences.removeObserver("", this.preferenceObserver);
  },
    
  get prefInterval() {
    let interval = preferences.getIntPref(this.intervalPreference);
    
    // Ensure that it's not possible to refresh faster than the minimum limit (for courtesy to sites) 
    interval = Math.max(interval, this.minimumInterval);

    return interval;
  },
  
  get isEnabled() {
    return preferences.getBoolPref(this.enabledPreference);
  },
  
  updateEnabled: function() {
    if (this.isEnabled && this.isStarted) {
      ActiveInterval.prototype.start.call(this);
    } else {
      ActiveInterval.prototype.stop.call(this);
    }
  },
  
  updateInterval: function() {
    this.setInterval(this.prefInterval);
  }
}
PreferenceActiveInterval.prototype.__proto__ = ActiveInterval.prototype;