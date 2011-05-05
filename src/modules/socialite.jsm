var EXPORTED_SYMBOLS = ["Socialite"];

var Socialite =
{
  globals: {
    MINIMUM_REFRESH_INTERVAL: 2*60,
    IDLE_THRESHOLD: 4*60
  },
  
  init: function() {
    Socialite.loaded = false;
    
    Socialite.sites = new SiteCollection();
    Socialite.watchedURLs = new WatchedURLs();
    
    Socialite.stringBundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
                             .getService(Components.interfaces.nsIStringBundleService)
                             .createBundle("chrome://socialite/locale/socialite.properties");
  },
  
  load: function() {
    if (!Socialite.loaded) {
      Socialite.sites.loadConfiguredSites();
      Socialite.loaded = true;
    }
  },
  
  utils: {

    openUILink: function(url, e) {
      window = windowManager.getMostRecentWindow("navigator:browser");
      window.openUILink(url, e);
    },
    
    openUILinkIn: function(url, where) {
      window = windowManager.getMostRecentWindow("navigator:browser");
      window.openUILinkIn(url, where);
    },
    
    showNotification: function(title, message, icon, name, listener, data) {
      if (!icon) {
        icon = "chrome://socialite/skin/socialite.png";
      }
      
      if (!name) {
        name = "socialite-message";
      }
      
      let clickable = listener != null;
      if (alertsService) {
        alertsService.showAlertNotification(icon, title, message, clickable, data, listener, name);
      }
    },
    
    failureMessage: function(title, message) {
      logger.log("Socialite", "Failure occurred, message: " + message);
      
      let titlePart;
      if (title) {
        titlePart = " ("+title+")";
      } else {
        titlePart = "";
      }
      
      Socialite.utils.showNotification(
        Socialite.stringBundle.GetStringFromName("failureMessage.title") + titlePart,
        message,
        "chrome://global/skin/icons/Error.png",
        "socialite-failure"
      );
    },
    
    siteFailureMessage: function(site, subject, message) {
      Socialite.failureMessage(site.siteName, subject+": "+message);
    }
    
  }

}

// *** Bring up the preferences first thing ***
Socialite.preferences = Components.classes["@mozilla.org/preferences-service;1"]
                                           .getService(Components.interfaces.nsIPrefService)
                                           .getBranch("extensions.socialite.");
Socialite.preferences.QueryInterface(Components.interfaces.nsIPrefBranch2);

// *** Now, initialize the logging system ***
let logger = Components.utils.import("resource://socialite/utils/log.jsm");
logger.init("Socialite", {
  enabled:    Socialite.preferences.getBoolPref("debug"),
  useConsole: Socialite.preferences.getBoolPref("debugInErrorConsole")
});

// *** Check for and perform any necessary migration ***
let migration = Components.utils.import("resource://socialite/migration.jsm").SocialiteMigration;
migration.perform();

// *** Load some useful XPCOM imports ***
let alertsService = null;
try {
  // This seems to fail sometimes on OSX (if Growl is not installed?)
  alertsService = Components.classes["@mozilla.org/alerts-service;1"]
                  .getService(Components.interfaces.nsIAlertsService);
} catch (e) {
  logger.log("Socialite", "Unable to load alerts service. For the duration of this session, alerts will be logged, but not displayed.");
}

let windowManager = Components.classes['@mozilla.org/appshell/window-mediator;1']
                    .getService(Components.interfaces.nsIWindowMediator);

// *** Import application components now that we're initialized and Socialite is defined ***
Components.utils.import("resource://socialite/site.jsm");
Components.utils.import("resource://socialite/watchedURLs.jsm");

// *** Finish initialization (now that the environment is set up) ***
Socialite.init();

// *** Load built-in sites ***
Components.utils.import("resource://socialite/reddit/reddit.jsm");
