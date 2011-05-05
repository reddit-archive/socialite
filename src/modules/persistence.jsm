Components.utils.import("resource://socialite/socialite.jsm");
logger = Components.utils.import("resource://socialite/utils/log.jsm");
Components.utils.import("resource://socialite/utils/strUtils.jsm");

var IOService = Components.classes["@mozilla.org/network/io-service;1"]
                .getService(Components.interfaces.nsIIOService);

var EXPORTED_SYMBOLS = ["onLocationChange"]

var PERSIST_NONE    = 0;
var PERSIST_SITE    = 1;
var PERSIST_SECTION = 2;
var PERSIST_ALWAYS  = 3;

function dropPathLevels(path, levels) {
  // Strip a trailing slash
  if (path[path.length-1] == "/") {
    path = path.substring(0, path.length-1);
  }
  
  // Strip parameters
  var paramPos = path.lastIndexOf("?");
  if (paramPos != -1) {
    path = path.substring(0, paramPos);
  }

  for (var i=0; i<levels; i++) {
    var pos = path.lastIndexOf("/");
    if (pos == -1) {
      // No more levels to remove!
      return path;
    } else {
      path = path.substring(0, pos);
    }
  }
  
  return path;
}

function stripWWW(path) {
  return path.replace(/^www\./, "");
}

function onLocationChange(oldURL, newURL) {
  var persistMode = Socialite.preferences.getIntPref("persistMode");
  
  if (persistMode == PERSIST_NONE) {
    return false;
  } else if (persistMode == PERSIST_ALWAYS) {
    return true;
  }
  
  // Parse 'em
  var oldURI = IOService.newURI(oldURL, null, null);                   
  var newURI = IOService.newURI(newURL, null, null)

  oldHost = stripWWW(oldURI.host);
  newHost = stripWWW(newURI.host);
                        
  if (persistMode == PERSIST_SITE) {
    logger.log("Persistence", "Comparing hosts: " + oldHost + ", " + newHost);
    return (oldHost == newHost);
    
  } else if (persistMode == PERSIST_SECTION) {
    // We'll use a function instead of nsIURL.directory here because we don't care if the URL ends with a trailing slash or not -- we just want to leave out the last section.
  
    var oldDir = dropPathLevels(oldURI.path, 1);
    
    logger.log("Persistence", "Comparing hosts and directories: " + oldHost + ":" + oldDir + ", " + newHost + ":" + newURI.path);
    return (oldHost == newHost) && strStartsWith(newURI.path, oldDir);
  }
}
