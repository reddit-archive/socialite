SocialiteWindow.ActiveRefresh = (function() {
  let modules = {};
  let importModule = function(name) Components.utils.import(name, modules);
  
  let Socialite = importModule("resource://socialite/socialite.jsm").Socialite;
  let logger = importModule("resource://socialite/utils/log.jsm");
  let PreferenceActiveInterval = importModule("resource://socialite/utils/activeInterval.jsm").PreferenceActiveInterval;
  
  var ActiveRefresh = {
      onLoad: function() {
        this.barInterval = new PreferenceActiveInterval(
          function callback() {
            logger.log("activerefresh", "Refreshing current content bar");
            // Refresh with the skipEvent parameter true, so we don't reset the interval needlessly.
            SocialiteWindow.refreshCurrentContentBar(true);
          },
          "extensions.socialite.refreshInterval",
          "extensions.socialite.refreshBarEnabled",
          Socialite.globals.MINIMUM_REFRESH_INTERVAL,
          Socialite.globals.IDLE_THRESHOLD
        );
        
        let self = this;
        
        // Reset the refresh interval when a refresh occurs.
        gBrowser.addEventListener("SocialiteContentBarRefresh", function(event) {
          logger.log("activerefresh", "Resetting content bar refresh interval");
          self.barInterval.reset();
        }, false);
        
        // Start/stop the refresh interval based on the presence of a content bar.
        gBrowser.addEventListener("SocialiteContentBarChanged", function(event) {
          self.checkBarStatus();
        }, false);
      },
      
      onUnload: function() {
        // In case the interval is running, we shouldn't leave a dangling idleObserver.
        this.barInterval.destroy();
      },
      
      checkBarStatus: function() {
        if (SocialiteWindow.currentContentBar) {
          this.barInterval.start();
        } else {
          this.barInterval.stop();
        }
      },
  };
  
  return ActiveRefresh;
})();