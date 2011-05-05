// High-level reddit commands

logger = Components.utils.import("resource://socialite/utils/log.jsm");
Components.utils.import("resource://socialite/utils/action/action.jsm");
http = Components.utils.import("resource://socialite/utils/action/httpRequest.jsm");
Components.utils.import("resource://socialite/utils/hitch.jsm");
Components.utils.import("resource://socialite/utils/quantizer.jsm");
Components.utils.import("resource://socialite/reddit/authentication.jsm");

var nativeJSON = Components.classes["@mozilla.org/dom/json;1"]
                 .createInstance(Components.interfaces.nsIJSON);

var EXPORTED_SYMBOLS = ["RedditAPI", "RedditVersion"];

QUANTIZE_TIME = 1000;
AUTH_EXPIRE_AGE = 4*60*60;

// Socialite recognizes the following unofficial versions for compatibility purposes:
//
// API versions:
//   0.0 -- original API
//   0.1 -- by_id API request added
//
// DOM versions:
//   0.0 -- original DOM, before jQuery changes
//   1.0 -- after jQuery changes
//   1.1 -- consolidation of link/linkcompressed classes; higher-level likes/dislikes/unvoted classes
REDDIT_LATEST_VERSION = { dom:"1.1", api:"0.1" };

function RedditVersion(){};
RedditVersion.prototype = REDDIT_LATEST_VERSION;
RedditVersion.prototype.compare = function(field, value) {
  const versionCompare = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
                                            .getService(Components.interfaces.nsIVersionComparator)
                                            .compare;
  return versionCompare(this[field], value);
}

var REDDIT_API_PATH = "api/";
function APIURL(siteURL, op, subreddit) {
  // Note: vote calls will 404 without the 'www.' (included in site URL)
  var subredditPart;
  if (subreddit) {
    subredditPart = "r/" + subreddit + "/";
  } else {
    subredditPart = ""; 
  }
  return siteURL + subredditPart + REDDIT_API_PATH + op;
}

function sameURL(func1, arg1, func2, arg2) {
  var url1 = arg1[0];
  var url2 = arg2[0];
  var subreddit1 = arg1[1];
  var subreddit2 = arg2[1];
  
  return (url1 == url2) && (subreddit1 == subreddit2);
}

function sameFirstArg(func1, arg1, func2, arg2) {
  return (arg1[0] == arg2[0]);
}

function tryJSON(action, r) {
  let json;
  try {
    json = nativeJSON.decode(r.responseText);
  } catch (e) {
    action.failure(r);
    return;
  }
  action.success(r, json);
}

function DepaginateAction(baseurl, params, successCallback, failureCallback) {
  let act = _DepaginateAction(successCallback, failureCallback);
  
  act.baseurl = baseurl;
  if (params) {
    act.params = params;
  } else {
    act.params = {};
  }
  
  act.limit = 20;
  act.count = 0;
  act.items = [];
  return act
}

var _DepaginateAction = Action("depaginate", function(action) {
  let fauxJSON = function() {
    return {"kind":"Listing", "data":{"children":action.items}};
  }
  
  let fetchNext = function(after) {
    if (action.count < action.limit) {
      action.count += 1;
      logger.log("reddit", "Depaginate action running (page " + action.count + "; after=" + after + ")");

      if (after) {
        action.params["after"] = after;
      }
      
      http.GetAction(
        action.baseurl,
        action.params,
        
        function success(r) {
          let json;
          try {
            // Add the items in the JSON to our collection, and save the "after" attribute.
            json = nativeJSON.decode(r.responseText);
            action.items = action.items.concat(json.data.children);
            nextAfter = json.data.after;
          } catch (e) {
            action.failure(r);
            return;
          }
          
          if (nextAfter) {
            fetchNext(nextAfter);
          } else {
            // Return the final request and a faux JSON response with the full listing.
            action.success(r, fauxJSON());
          }
        },
        action.chainFailure()
      ).perform();
    } else {
      // We hit the request limit. Return a null request and what we got.
      action.success(null, fauxJSON());
    }
  }
  fetchNext();
});

function RedditAPI(siteURL) {
  this.siteURL = siteURL;
  
  this.urlinfoQuantizer = new Quantizer("reddit.urlInfo.quantizer", QUANTIZE_TIME, sameURL);
  this.urlinfo = Action("reddit.urlinfo", this.urlinfoQuantizer.quantize(this._urlinfo));
  
  this.thinginfoQuantizer = new Quantizer("reddit.thinginfo.quantizer", QUANTIZE_TIME, sameFirstArg);
  this.thinginfo = Action("reddit.thinginfo", this.thinginfoQuantizer.quantize(this._thinginfo));
    
  this.voteQuantizer = new Quantizer("reddit.vote.quantizer", QUANTIZE_TIME, sameFirstArg);
  this.vote = Action("reddit.vote", this.voteQuantizer.quantize(this._vote));
  
  this.saveQuantizer = new Quantizer("reddit.save.quantizer", QUANTIZE_TIME, sameFirstArg);
  this.save = Action("reddit.save", this.saveQuantizer.quantize(this._save));
  this.unsave = Action("reddit.unsave", this.saveQuantizer.quantize(this._unsave));
  
  this.hideQuantizer = new Quantizer("reddit.hide.quantizer", QUANTIZE_TIME, sameFirstArg);
  this.hide = Action("reddit.hide", this.hideQuantizer.quantize(this._hide));
  this.unhide = Action("reddit.unhide", this.hideQuantizer.quantize(this._unhide));
}

RedditAPI.prototype.init = function(version, auth) {
  this.version = new RedditVersion();
  // Copy specified versions into our version object.
  if (version) {
    for (let field in version) {
      if (version[field]) {
        this.version[field] = version[field];
      }
    }
  }
  
  if (auth) {
    this.auth = auth;
  } else {
    this.auth = new RedditAuth(this.siteURL, this.version, AUTH_EXPIRE_AGE);
  }
}

RedditAPI.prototype.destroy = function() {
  // Nothing to clean up, yet.
}

// Generalized API actions

RedditAPI.prototype._getJSON = function(url, params, action) {
  http.GetAction(url, params,
    function success(r) {
      tryJSON(action, r);
    },
    action.chainFailure()
  ).perform();
};

RedditAPI.prototype._postLinkCommand = function(command, linkID, params, action) {
  logger.log("reddit", "Making " + command + " API call");
  
  if (params == null) {
    params = {};
  }
  params["id"] = linkID;
  
  let self = this;
  this.auth.actionParams(action, params,
    function success(authParams) {
      var act = http.PostAction(APIURL(self.auth.siteURL, command), authParams);
      act.chainTo(action);
      act.perform();
    }
  );
};

function postLinkCommand(command) {
  return function(linkID, action) {
    this._postLinkCommand(command, linkID, {}, action);
  };
};

// Reddit API actions

RedditAPI.prototype._urlinfo = function(url, subreddit, action) {
  logger.log("reddit", "Making info API request");
  this._getJSON(
    APIURL(this.auth.siteURL, "info.json", subreddit),
    {url:url, limit:1}, action
  );
};

RedditAPI.prototype._thinginfo = function(thingID, action) {
  logger.log("reddit", "Making by_id API request");
  this._getJSON(
    this.auth.siteURL + "by_id/" + thingID + ".json",
    null, action
  );
};

RedditAPI.prototype.randomrising = Action("reddit.randomrising", function(action) {
  logger.log("reddit", "Making randomrising API request");
  this._getJSON(
    this.auth.siteURL + "randomrising.json",
    {limit:1}, action
  );
});

RedditAPI.prototype.messages = Action("reddit.messages", function(mark, action) {
  logger.log("reddit", "Making messages API request");
  this._getJSON(
    this.auth.siteURL + "message/inbox.json",
    {mark:mark}, action
  );
});

RedditAPI.prototype.userinfo = Action("reddit.userinfo", function(username, action) {
  logger.log("reddit", "Making userinfo API request");
  this._getJSON(
    this.auth.siteURL + "user/" + username + "/about.json",
    null, action
  );
});

RedditAPI.prototype.myuserinfo = Action("reddit.myuserinfo", function(action) {
  logger.log("reddit", "Making myuserinfo API request");
  
  let self = this;
  this.auth.getAuthInfo(
    function(authInfo) {
      if (authInfo.username) {
        let act = self.userinfo();
        act.chainTo(action);
        act.perform(authInfo.username);
      } else {
        action.failure();
      }
    },
    action.chainFailure()
  ).perform();
});

RedditAPI.prototype.mysubreddits = Action("reddit.mysubreddits", function(action) {
  logger.log("reddit", "Making mysubreddits API request");
    
  var act = DepaginateAction(this.auth.siteURL + "reddits/mine.json");
  act.chainTo(action);
  act.perform();
});

RedditAPI.prototype._vote = function(linkID, isLiked, action) {
  var dir;
  if (isLiked == null) {
    dir = 0;
  } else {
    dir = isLiked ? 1 : -1;
  }
  this._postLinkCommand("vote", linkID, {dir:dir}, action);
};

RedditAPI.prototype._save   = postLinkCommand("save");
RedditAPI.prototype._unsave = postLinkCommand("unsave");
RedditAPI.prototype._hide   = postLinkCommand("hide");
RedditAPI.prototype._unhide = postLinkCommand("unhide");