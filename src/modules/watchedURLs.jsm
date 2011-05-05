Components.utils.import("resource://socialite/socialite.jsm");
logger = Components.utils.import("resource://socialite/utils/log.jsm");

var EXPORTED_SYMBOLS = ["WatchedURLs"];

/**
 * Generator that flattens argument and yields sequentially
 */
function each(thing, maxlevel) {
  if (maxlevel != null && maxlevel <= 0) {
    // Level <= 0
    yield thing;
  } else {
    // Decrement maxlevel, if any
    if (maxlevel != null) {
      maxlevel -= 1;
    }
    
    // Traverse
    if (thing instanceof Array) {
      // Flatten
      for (let j=0; j<thing.length; j++) {
        // Recurse
        for (var e in each(thing[j], maxlevel)) {
          yield e;
        }
      }
    } else if (thing instanceof Object) {
      // Flatten values
      for each (let val in thing) {
        // Recurse
        for (var e in each(val, maxlevel)) {
          yield e;
        }
      }
    } else {
      // Base case
      yield thing;
    }
  }
}

function WatchInfo(URL) {
  this.URL = URL;
  this.hidden = false;
  this._info = {};
  this.redirectsFrom = {};
  this.redirectsTo = {};
}
WatchInfo.prototype = {  
  addSite: function(site, linkInfo, replace) {
    if (!this._info[site.siteID] || replace) {
      this._info[site.siteID] = linkInfo;
    }
  },
  
  removeSite: function(site) {
    if (this._info[site.siteID]) {
      delete this._info[site.siteID];
    }
  },
  
  addRedirectTo: function(watchInfo) {
    if (!(watchInfo.URL in this.redirectsTo)) {
      this.redirectsTo[watchInfo.URL] = watchInfo;
    }
  },
  
  addRedirectFrom: function(watchInfo) {
    if (!(watchInfo.URL in this.redirectsFrom)) {
      this.redirectsFrom[watchInfo.URL] = watchInfo;
    }
  },
  
  /**
   * Ensure that the watch is not hidden or otherwise prevented from displaying.
   */
  activate: function() {
    this.hidden = false;
  },
  
  /**
   * Iterator traversing all WatchInfo instances (redirects) that could provide info for this instance, including itself.
   */
  iterateAlternatives: function(seen) {
    var seen;
    if (!seen) {
      seen = {};
    }
    
    seen[this.URL] = true;
    yield this;
    
    for (let redirect in each([this.redirectsFrom, this.redirectsTo], 2)) {
      if (!(redirect.URL in seen)) {
        for (let child in redirect.iterateAlternatives(seen)) {
          yield child;
        }
      }
    }
  },
  
  __iterator__: function() {
    for (let watchInfo in this.iterateAlternatives()) {
      for (let v in Iterator(watchInfo._info)) {
        yield v;
      }
    }
  },
  
  _getSite: function(site) {
    if (this._hasSite(site)) {
      return this._info[site.siteID];
    }
  },
  getSite: function(site) {
    for (let watchInfo in this.iterateAlternatives()) {
      if (watchInfo._hasSite(site)) {
        return watchInfo._getSite(site);
      }
    } 
  },
  
  _hasSite: function(site) {
    if (site.siteID in this._info) {
      return true;
    }
    return false;
  },
  hasSite: function(site) {
    for (let watchInfo in this.iterateAlternatives()) {
      if (watchInfo._hasSite(site)) {
        return true;
      }
    }
    return false;
  },
  
  _isEmpty: function() {
    // From http://objectmix.com/javascript/351435-json-object-empty.html#post1284914
    for (var i in this._info) {
      return false;
    }
    return true;
  },
  isEmpty: function() {
    for (let watchInfo in this.iterateAlternatives()) {
      if (!watchInfo._isEmpty()) {
        return false;
      }
    }
    return true;
  }
}

function WatchedURLs() {
  this._watches = {};
}
WatchedURLs.prototype = {
  _touch: function(URL) {
    if (URL in this._watches) {
      return this.get(URL);
    } else {
      var newWatch = new WatchInfo(URL);
      this._watches[URL] = newWatch;
      return newWatch;
    }
  },
    
  watch: function(URL, site, linkInfo, replace) {
    if (Socialite.sites.isLoaded(site)) {
      this._touch(URL).addSite(site, linkInfo, replace);
      
      // Adding a new site will activate a hidden/suppressed watch, since we should show the new information.
      this._watches[URL].activate();
    
      logger.log("WatchedURLs", "Watching: " + URL);
    }
  },
  
  addRedirect: function(fromURL, toURL) {
    let fromWatch = this._touch(fromURL);
    let toWatch = this._touch(toURL);
    
    fromWatch.addRedirectTo(toWatch);
    toWatch.addRedirectFrom(fromWatch);

    logger.log("WatchedURLs", "Watching redirect: " + toURL);
  },

  isRedirect: function(fromURL, toURL) {
    if (this.isWatched(fromURL) && this.isWatched(toURL)) {
      let fromWatch = this.get(fromURL);
      let toWatch = this.get(toURL);
      
      for (let watchInfo in toWatch.iterateAlternatives()) {
        if (watchInfo == fromWatch) {
          return true;
        }
      }
    }
    return false;
  },

  get: function(URL) {
    return this._watches[URL];
  },

  getBy: function(URL, site) {
    if (this.isWatched(URL)) {
      return this.get(URL).getSite(site);
    }
    return null;
  },

  isWatched: function(URL) {
    return ((URL in this._watches) && !this.get(URL).isEmpty());
  },

  isWatchedBy: function(URL, site) {
    return (this.isWatched(URL) && this.get(URL).hasSite(site));
  },

  removeSite: function(site) {
    for each (watchInfo in this._watches) {
      watchInfo.removeSite(site);
    };
  }
}