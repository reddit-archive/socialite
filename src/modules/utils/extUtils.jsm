var EXPORTED_SYMBOLS = ["openPreferences"];

let preferencesBranch = Components.classes["@mozilla.org/preferences-service;1"]
                        .getService(Components.interfaces.nsIPrefBranch2);

function openPreferences(window, optionsURL, paneID) {
  // Copied from chrome://mozapps/content/extensions/extensions.js.
  // Modified to accept an arbitrary optionsURL, and to open to the pane with ID paneID.
  
  let windows = Components.classes['@mozilla.org/appshell/window-mediator;1']
                                   .getService(Components.interfaces.nsIWindowMediator)
                                   .getEnumerator(null);
  
  while (windows.hasMoreElements()) {
    let win = windows.getNext();
    if (win.document.documentURI == optionsURL) {
      win.focus();
      if (paneID) {
        let pane = win.document.getElementById(paneID);
        win.document.documentElement.showPane(pane);
      }
      return win;
    }
  }
  
  let features;
  try {
    let instantApply = preferencesBranch.getBoolPref("browser.preferences.instantApply");
    features = "chrome,titlebar,toolbar,centerscreen" + (instantApply ? ",dialog=no" : ",modal");
  }
  catch (e) {
    features = "chrome,titlebar,toolbar,centerscreen,modal";
  }
  return window.openDialog(optionsURL, "", features, paneID);
}