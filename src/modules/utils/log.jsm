var EXPORTED_SYMBOLS = ["log", "defaultSettings", "init", "formatEntry", "getHistory", "formatHistory", "getFormattedHistory", "makeStubFunction"]

// Defaults
defaultSettings = {
  enabled:     false,
  useConsole:  false,
  appName:     "logger",
}

logInitialized = false;
logSettings = null;
logHistory = [];

function init(appname, settings) {
  if (!logInitialized) {
    if (settings) {
      logSettings = settings;
    } else {
      logSettings = logDefaultSettings;
    }
    
    logSettings.appName = appname;
  } else {
    throw "Log already initialized";
  }
}

function formatEntry(entry) {
  var identifier;
  if (entry.identifier) {
    identifier = "("+entry.identifier+")"; 
  } else {
    identifier = "";
  }
  return "["+logSettings.appName+"] " + entry.section + identifier + " -- " + entry.msg + "\n";
}

function log() {
  let entry;
  if (arguments.length == 2) {
    entry = {section: arguments[0], msg: arguments[1]};
  } else if (arguments.length == 3) {
    entry = {section: arguments[0], identifier: arguments[1], msg: arguments[2]};
  }

  if (logSettings.enabled) {
    let logText = formatEntry(entry);
  
    if (logSettings.useConsole) {
      const consoleService = Components.classes["@mozilla.org/consoleservice;1"]
                                       .getService(Components.interfaces.nsIConsoleService);
      consoleService.logStringMessage(logText);
    } else {
      dump(logText);
    }
    
    logHistory.push(entry);
  }
}

function getHistory() {
  // Return a copy of the log history
  return logHistory.concat();
}

function formatHistory(history) {
  return history.reduce(function(previousValue, currentValue, index, array) {
    return previousValue + "\n" + logFormat(currentValue); 
  }, "");
}

function getFormattedHistory() {
  return formatHistory(logHistory);
}

function makeStubFunction(section, stubname) {
  return (function() {
    log(section, "Stub function '"+stubname+"' called");
  });
}
