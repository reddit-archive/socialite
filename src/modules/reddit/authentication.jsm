logger = Components.utils.import("resource://socialite/utils/log.jsm");
Components.utils.import("resource://socialite/utils/action/action.jsm");
Components.utils.import("resource://socialite/utils/action/cachedAction.jsm");
http = Components.utils.import("resource://socialite/utils/action/httpRequest.jsm");
Components.utils.import("resource://socialite/utils/hitch.jsm");
Components.utils.import("resource://socialite/utils/watchable.jsm");

var EXPORTED_SYMBOLS = ["RedditAuth", "authParams"];

// ---

function RedditAuth(siteURL, version, expires) {
  this.siteURL = siteURL;
  this.version = version;
  
  this.authInfo = {username:false, modhash:""};
  this.getAuthInfo = CachedAction(this._getAuthInfo, expires);
  
  this.onUsernameChange = new Watchable();
  this.onModHashChange = new Watchable();
  this.onStateChange = new Watchable();
}
RedditAuth.prototype = {
  get isLoggedIn() { return this.authInfo.isLoggedIn; },
  get username() { return this.authInfo.username; },
  get modhash() { return this.authInfo.modhash; },
  
  _getAuthInfo: Action("reddit_auth.getAuthInfo", function(action) {
    logger.log("reddit_auth", this.siteURL, "Getting new authentication info");
    
    let act = http.GetAction(
      this.siteURL + "api/me.json",
      null,
      
      hitchThis(this, function success(r) {
        let authInfo;
        try {
          let json = JSON.parse(r.responseText);
          if (json.data) {
            authInfo = {username: json.data.name, modhash: json.data.modhash, isLoggedIn: true, info: json.data};
          } else {
            authInfo = {username: false, isLoggedIn: false};
          }
        } catch (e) {
          action.failure(r);
          return;
        }
        this._updateAuthInfo(authInfo);
        action.success(authInfo);
      }),
      function failure(r) { action.failure(); }
    );
    
    act.perform();
  }),
  
  _updateAuthInfo: function(authInfo) {
    let oldAuthInfo = this.authInfo;
    this.authInfo = authInfo;
    
    if (authInfo.modhash != oldAuthInfo.modhash) {
      logger.log("reddit_auth", this.siteURL, "Modhash changed.");
      this.onModHashChange.send(authInfo.modhash);
    }
    
    if (authInfo.username != oldAuthInfo.username) {
      logger.log("reddit_auth", this.siteURL, "Username changed: " + authInfo.username);
      this.onUsernameChange.send(authInfo.username);
    }
    
    if (authInfo.isLoggedIn != oldAuthInfo.isLoggedIn) {
      logger.log("reddit_auth", this.siteURL, "Login state changed: " + authInfo.isLoggedIn);
      this.onStateChange.send(authInfo.isLoggedIn);
    }
  },

  snarfAuthInfo: function(doc, win) {
    let authInfo = extractAuthInfo(doc);
    if (authInfo) {
      logger.log("reddit_auth", this.siteURL, "Scraped auth data from the page.");
      this.getAuthInfo.cachedValue.updated(authInfo); // reset authentication info expiration
      this._updateAuthInfo(authInfo);
    }
  },
  
  actionParams: function(action, params, successCallback) {
    this.getAuthInfo(
      function success(authInfo) {
        successCallback(authParams(params, authInfo));
      },
      action.chainFailure()
    ).perform();
  }
};

function authParams(params, authInfo) {
  if (authInfo.modhash) {
    params["uh"] = authInfo.modhash;
  }
  return params;
}

function extractAuthInfo(document) {
  let configInfo = scrapeConfigInfo(document);
  if (!configInfo) { return; }

  let authInfo = {
    username: configInfo.logged,
    modhash:  configInfo.modhash
  };
  authInfo.isLoggedIn = (authInfo.username != false) && (authInfo.username != null) && (authInfo.modhash != "");
  return authInfo;
}

function scrapeConfigInfo(document) {
  try {
    var configScript = document.getElementById("config");
    if (!configScript) { return; }
    const unwrapJSONP = /[\w\.]*\((.+)\)/;
    let json = configScript.textContent.match(unwrapJSONP)[1];
    return JSON.parse(json);
  } catch (e)  {
    logger.log("reddit_auth", this.siteURL, "Unable to scrape auth data from the page: " + e.toString());
  }
}
