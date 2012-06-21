Components.utils.import("resource://socialite/utils/watchable.jsm");

var IOService = Components.classes["@mozilla.org/network/io-service;1"]
                .getService(Components.interfaces.nsIIOService);

var faviconService = Components.classes["@mozilla.org/browser/favicon-service;1"]
                                        .getService(Components.interfaces.nsIFaviconService);

var historyService = Components.classes["@mozilla.org/browser/nav-history-service;1"]
                     .getService(Components.interfaces.nsINavHistoryService);

var EXPORTED_SYMBOLS = ["setFavicon", "getFaviconURL", "addFaviconWatch", "useFaviconAsAttribute"];

var watchables = {};
var favicons = {}

function setFavicon(siteURL, faviconURL) {
  favicons[siteURL] = faviconURL;

  let watchable = watchables[siteURL];
  if (watchable) {
    watchable.send(faviconURL);
  }

  return faviconURL;
}

function getFaviconURL(siteURL) {
  return favicons[siteURL]
}

function addFaviconWatch(siteURL, changedCallback) {
  // Add the watch
  if (!watchables[siteURL]) {
    watchables[siteURL] = new Watchable();
  }
  
  return watchables[siteURL].watch(changedCallback);
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
