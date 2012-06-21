Components.utils.import("resource://socialite/socialite.jsm");
logger = Components.utils.import("resource://socialite/utils/log.jsm");
faviconWatch = Components.utils.import("resource://socialite/utils/faviconWatch.jsm");
Components.utils.import("resource://socialite/utils/strUtils.jsm");
Components.utils.import("resource://socialite/utils/watchable.jsm");
Components.utils.import("resource://socialite/utils/activeInterval.jsm");


var IOService = Components.classes["@mozilla.org/network/io-service;1"]
                .getService(Components.interfaces.nsIIOService);

var observerService = Components.classes["@mozilla.org/observer-service;1"]
                      .getService(Components.interfaces.nsIObserverService);

var prefService = Components.classes["@mozilla.org/preferences-service;1"]
                  .getService(Components.interfaces.nsIPrefService);


var EXPORTED_SYMBOLS = ["SocialiteSite", "SiteCollection", "SiteClassRegistry"];

function SocialiteSite(siteID, siteName, siteURL) {
  this.siteID = siteID;
  this.siteName = siteName;
  this.siteURI = IOService.newURI(siteURL, null, null);
  this.siteURL = this.siteURI.spec;
  this.loaded = false;
  this._alertState = false;
}
SocialiteSite.prototype = {
  siteClassID:      "SocialiteSite",
  siteClassName:    "Socialite Site",
  siteClassIconURI: "",
  
  getIconURI: function() {
    // We'll assume that favicon.ico exists for now.
    return this.siteURI.prePath+"/favicon.ico";
  },
  
  onLoad: function() {
    this.sitePreferences = Components.classes["@mozilla.org/preferences-service;1"]
                           .getService(Components.interfaces.nsIPrefService)
                           .getBranch("extensions.socialite.sites."+this.siteID+"."+this.siteClassID+".");
    this.sitePreferences.QueryInterface(Components.interfaces.nsIPrefBranch2);
    
    faviconWatch.setFavicon(this.siteURL, this.getIconURI());
    
    this.onAlertStateChange = new Watchable();
    this.loaded = true;
  },
  
  onUnload: function() {
    this.loaded = false;
  },
  
  get alertState() {
    return this._alertState;
  },
  
  set alertState(value) {
    this._alertState = value;
    if (this.onAlertStateChange) {
      this.onAlertStateChange.send(value);
    }
  },
  
  onCreate: logger.makeStubFunction("SocialiteSite", "onCreate"),
  onDelete: logger.makeStubFunction("SocialiteSite", "onDelete"),
  setDefaultPreferences: logger.makeStubFunction("SocialiteSite", "setDefaultPreferences"),
  onSitePageLoad: logger.makeStubFunction("SocialiteSite", "onSitePageLoad"),
  getLinkInfo: logger.makeStubFunction("SocialiteSite", "getLinkInfo"),
  createBarContentUI: logger.makeStubFunction("SocialiteSite", "createBarContentUI"),
  createBarSubmitUI: logger.makeStubFunction("SocialiteSite", "createBarSubmitUI"),
  createPreferencesUI: logger.makeStubFunction("SocialiteSite", "createPreferencesUI"),
  refreshAlertState: logger.makeStubFunction("SocialiteSite", "refreshAlertState")
}


// ---

function SiteCollection() {
  this.byID = {};
  this.count = 0;
}

SiteCollection.prototype.__iterator__ = function() {
  for (let siteID in this.byID) {
    let site = this.byID[siteID];
    if (site) {
      yield [siteID, site];
    }
  }
}

SiteCollection.prototype.initRefreshInterval = function() {
  let self = this;
  this.siteRefreshInterval = new PreferenceActiveInterval(
    function callback() {
      logger.log("sites", "Refreshing site alert states");
      
      for (let [siteID, site] in self) {
        site.refreshAlertState();
      }
    },
    "extensions.socialite.refreshInterval",
    "extensions.socialite.refreshSitesEnabled",
    Socialite.globals.MINIMUM_REFRESH_INTERVAL,
    Socialite.globals.IDLE_THRESHOLD
  );
  this.siteRefreshInterval.start();
  this.siteRefreshInterval.tick();
}

SiteCollection.prototype.onContentLoad = function(doc, win) {
  if (doc.location) {
    for (let [siteID, site] in this) {
      // Remove www.
      var baseRegex = /www\.?/;
      var baseSiteHost = site.siteURI.spec.replace(baseRegex, "");
      var baseURL = doc.location.href.replace(baseRegex, "");
      if (strStartsWith(baseURL, baseSiteHost)) {
        site.onSitePageLoad(doc, win);
      }
    }
  }
}

SiteCollection.prototype.loadSite = function(site) {
  logger.log("SiteCollection", "Loading site: \"" + site.siteName + "\" (" + site.siteClassID + ")");
  
  if (!this.byID[site.siteID]) {
    this.byID[site.siteID] = site;
  } else {
    throw "Site with id \""+site.siteID+"\" already loaded";
  }
  this.count += 1;
  
  // Initialize default preferences -- these don't get saved by the preference system
  this.setSiteDefaultPreferences(site.siteID, SiteClassRegistry.getClass(site.siteClassID));
  
  site.onLoad();
  observerService.notifyObservers(this, "socialite-load-site", site.siteID);
}

SiteCollection.prototype.unloadSite = function(site) {
  logger.log("SiteCollection", "Unloading site: \"" + site.siteName + "\" (" + site.siteClassID + ")");
  observerService.notifyObservers(this, "socialite-unload-site", site.siteID);
  site.onUnload();
  this.byID[site.siteID] = null;
  this.count -= 1;
  Socialite.watchedURLs.removeSite(site);
}

SiteCollection.prototype.reloadSite = function(site) {
  logger.log("SiteCollection", "Reloading site: \"" + site.siteName + "\" (" + site.siteClassID + ")");
  this.unloadSite(site);
  this.loadSite(site);  
}

SiteCollection.prototype.isLoaded = function(site) {
  return (site && this.byID[site.siteID] == site);
}

SiteCollection.prototype.loadConfiguredSites = function() {
  var siteIDs = JSON.parse(Socialite.preferences.getCharPref("sites"));
  
  siteIDs.forEach(function(siteID, index, array) {
    var siteName = Socialite.preferences.getCharPref("sites."+siteID+".siteName");
    var siteURL = Socialite.preferences.getCharPref("sites."+siteID+".siteURL")
    var siteClassID = Socialite.preferences.getCharPref("sites."+siteID+".siteClassID")
    
    logger.log("SiteCollection", "Loading site from preferences: \"" + siteName + "\" (" + siteClassID + ")");
    
    var siteClass = SiteClassRegistry.getClass(siteClassID);
    var newSite = new siteClass(siteID, siteName, siteURL);
    this.loadSite(newSite);    
  }, this);
  
  this.initRefreshInterval();
}

SiteCollection.prototype.saveConfiguredSites = function() {
  var siteIDs = [];
  for (let [siteID, site] in this) {
    siteIDs.push(site.siteID);
  }
  Socialite.preferences.setCharPref("sites", JSON.stringify(siteIDs));
}

SiteCollection.prototype.requestID = function(siteID) {
  if (!siteID) {
    // Since a specific ID was not requested, we will search for an available numeric one.
    for (var i=0; i<Number.MAX_VALUE; i++) {
      if (!(i in this.byID)) {
        siteID = i;
        break;
      }
    }
  }
  // If the specified siteID already exists, or we couldn't find one, return null.
  if (siteID in this.byID) {
    return null;
  }
  
  // Reserve this ID
  this.byID[siteID] = null;
  
  // Clear the preferences branch
  Socialite.preferences.deleteBranch("sites."+siteID+".");
  
  return siteID;
}

SiteCollection.prototype.releaseID = function(siteID) {
  if ((siteID in this.byID) && (this.byID[siteID] == null)) {
    delete this.byID[siteID];
    
    // Delete preferences
    Socialite.preferences.deleteBranch("sites."+siteID+".");
  } else {
    throw "Cannot release ID, ID in use";  
  }
}

SiteCollection.prototype.setSiteDefaultPreferences = function(siteID, siteClass) {
  // Clear any existing preferences and reset for a new site class
  let siteBranchPath = "sites."+siteID+"."+siteClass.prototype.siteClassID+".";
  let siteDefaultBranch = prefService.getDefaultBranch(Socialite.preferences.root+siteBranchPath);
  
  siteClass.prototype.setDefaultPreferences(siteDefaultBranch);
}

SiteCollection.prototype.createSite = function(siteClassID, siteID, siteName, siteURL) {
  logger.log("SiteCollection", "Creating site: \"" + siteName + "\" (" + siteClassID + ")");
  var siteClass = SiteClassRegistry.getClass(siteClassID);
  var newSite = new siteClass(siteID, siteName, siteURL);
  newSite.onCreate();
  this.loadSite(newSite);
  this.saveConfiguredSites();
  return newSite;
}

SiteCollection.prototype.deleteSite = function(site) {
  logger.log("SiteCollection", "Deleting site: \"" + site.siteName + "\" (" + site.siteClassID + ")");
  site.onDelete();
  this.unloadSite(site);
  this.releaseID(site.siteID);
}

//---

var SiteClassRegistry = 
{
  classes: {},
  
  addClass: function(constructor) {
    this.classes[constructor.prototype.siteClassID] = constructor;
  },
  
  getClass: function(classID) {
    return this.classes[classID];
  }
}
