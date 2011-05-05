Components.utils.import("resource://socialite/utils/watchable.jsm");

var IOService = Components.classes["@mozilla.org/network/io-service;1"]
                .getService(Components.interfaces.nsIIOService);

var faviconService = Components.classes["@mozilla.org/browser/favicon-service;1"]
                                        .getService(Components.interfaces.nsIFaviconService);

var historyService = Components.classes["@mozilla.org/browser/nav-history-service;1"]
                     .getService(Components.interfaces.nsINavHistoryService);

var EXPORTED_SYMBOLS = ["setFavicon", "getFaviconURL", "addFaviconWatch", "useFaviconAsAttribute"];

var watchables = {};

function setFavicon(siteURL, faviconURL, skipLoad) {
  let siteURI = IOService.newURI(siteURL, null, null);
  let faviconURI = IOService.newURI(faviconURL, null, null);
  
  if (!skipLoad) {
    faviconService.setAndLoadFaviconForPage(siteURI, faviconURI, false);
  }
  return faviconService.getFaviconImageForPage(siteURI).spec;
}

function getFaviconURL(siteURL) {
  let siteURI = IOService.newURI(siteURL, null, null);
  return faviconService.getFaviconImageForPage(siteURI).spec;
}

function addFaviconWatch(siteURL, changedCallback) {
  let siteURI = IOService.newURI(siteURL, null, null);
  let siteURISpec = siteURI.spec;
  
  // Add the watch
  if (!watchables[siteURISpec]) {
    watchables[siteURISpec] = new Watchable();
  }
  
  return watchables[siteURISpec].watch(changedCallback);
}

function useFaviconWatch(siteURL, changedCallback) {
  let removeFunction = addFaviconWatch(siteURL, changedCallback);
  changedCallback(getFaviconURL(siteURL));
  return removeFunction;
}

function useFaviconAsAttribute(element, attributeName, siteURL) {
  return useFaviconWatch(siteURL, function update(faviconURL) {
    element.setAttribute(attributeName, faviconURL);
  });
}

function useFaviconAsProperty(element, propertyName, siteURL) {
  return useFaviconWatch(siteURL, function update(faviconURL) {
    element[propertyName] = faviconURL;
  });
}

historyObserver = {
  onPageChanged: function(URI, what, value) {
    if (what == Components.interfaces.nsINavHistoryObserver.ATTRIBUTE_FAVICON) {
      // Notify all watchables that the favicon has changed, passing the new URI
      let watchable = watchables[URI.spec];
      if (watchable) {
        watchable.send(value);
      }
    }
  },

  onBeginUpdateBatch: function() {},
  onEndUpdateBatch: function() {},
  onVisit: function() {},
  onTitleChanged: function() {},
  onDeleteURI: function() {},
  onClearHistory: function() {},
  onPageExpired: function() {},
}

// This module persists for the lifetime of the app, so don't worry about removing the observer.
historyService.addObserver(historyObserver, false);