Components.utils.import("resource://socialite/socialite.jsm");
logger = Components.utils.import("resource://socialite/utils/log.jsm");
Components.utils.import("resource://socialite/site.jsm");
Components.utils.import("resource://socialite/utils/action/action.jsm");
Components.utils.import("resource://socialite/utils/action/cachedAction.jsm");
Components.utils.import("resource://socialite/utils/hitch.jsm");
Components.utils.import("resource://socialite/utils/domUtils.jsm");
Components.utils.import("resource://socialite/reddit/authentication.jsm");
Components.utils.import("resource://socialite/reddit/redditAPI.jsm");
//Components.utils.import("resource://socialite/reddit/bookmarkletAPI.jsm");
Components.utils.import("resource://socialite/reddit/redditLinkInfo.jsm");
Components.utils.import("resource://socialite/reddit/redditUtils.jsm");

var EXPORTED_SYMBOLS = ["RedditSite"];

let XPathResult = Components.interfaces.nsIDOMXPathResult;
let stringBundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
                                      .getService(Components.interfaces.nsIStringBundleService)
                                      .createBundle("chrome://socialite/locale/reddit.properties")
                                      
function RedditSite(siteID, siteName, siteURL) {
  SocialiteSite.apply(this, arguments);
}

RedditSite.prototype.__proto__ = SocialiteSite.prototype;

RedditSite.prototype.onLoad = function() {
  SocialiteSite.prototype.onLoad.apply(this, arguments);
  this.API = new RedditAPI(this.siteURL);
  
  // Load any version overrides from the preferences.
  let version = {};
  version.dom = this.sitePreferences.getCharPref("version.dom");
  version.api = this.sitePreferences.getCharPref("version.api");
  
  this.inboxURL = this.siteURL + "/message/inbox/";
  this.newMessages = [];
  this.lastNewMessageCount = null;
  
  this.API.init(version);
  
  this.cached = {
    mysubreddits: CachedAction(this.API.mysubreddits.bind(this.API), 30*60),
    myuserinfo:   CachedAction(this.API.myuserinfo.bind(this.API),    1*60)
  };
  
  this.cached._removeUsernameWatch = this.API.auth.onUsernameChange.watch(
    hitchThis(this, function(username) {
      // Reset subreddit and user info caches when the username changes.
      this.cached.mysubreddits.cachedValue.reset();
      this.cached.myuserinfo.cachedValue.reset();
      this.refreshAlertState();
    })
  );
};

RedditSite.prototype.onUnload = function() {
  SocialiteSite.prototype.onUnload.apply(this, arguments);
  this.cached._removeUsernameWatch();
  this.API.destroy();
};

RedditSite.prototype.setDefaultPreferences = function(siteDefaultBranch) {
  siteDefaultBranch.setCharPref("version.dom", "");
  siteDefaultBranch.setCharPref("version.api", "");
  siteDefaultBranch.setBoolPref("compactDisplay", true);
  siteDefaultBranch.setBoolPref("notificationsEnabled", false);
  siteDefaultBranch.setBoolPref("showScore", true);
  siteDefaultBranch.setBoolPref("showSubreddit", true);
  siteDefaultBranch.setBoolPref("showComments", true);
  siteDefaultBranch.setBoolPref("showSave", true);
  siteDefaultBranch.setBoolPref("showHide", false);
  siteDefaultBranch.setBoolPref("showRandom", false);
  siteDefaultBranch.setBoolPref("showProfile", false);
  siteDefaultBranch.setBoolPref("watchRedditSiteLinks", true);
};

RedditSite.prototype.onSitePageLoad = function(doc, win) {
  if (this.sitePreferences.getBoolPref("watchRedditSiteLinks")) {
    // Iterate over each article link and register event listener
    let startTime = Date.now();
    let linkXPath;
    if (this.API.version.compare("dom", "1") >= 0) {
      linkXPath = '//div[contains(@class, "thing") and (contains(@class, "link") or contains(@class, "linkcompressed"))]//a[contains(@class, "title")]';
    } else {
      linkXPath = '//div[starts-with(@id, "thingrow") and (contains(@class, "link") or contains(@class, "linkcompressed"))]//a[contains(@class, "title")]';
    }
    let res = doc.evaluate(linkXPath, doc.documentElement, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
     
    for (var i=0; i < res.snapshotLength; i++) {
      var siteLink = res.snapshotItem(i);
      
      // FIXME: click event listeners can persist after unloading, preventing the site from unloading properly and being garbage collected.
      // I'll allow this to happen for now, with a "loaded" check to cause the handlers to do nothing once the site is unloaded.
      // This is hopefully less demanding than keeping track of and cleaning up the listeners, or simply watching all links that are seen.
      siteLink.addEventListener("mouseup", hitchThis(this, function(e) {
        if (this.loaded) {
          this.linkClicked(e);
        }
      }), false);
      
      // For debugging purposes
      //siteLink.style.color = "red";
    }
    
    let endTime = Date.now();
    logger.log("RedditSite", this.siteName, "Added click handlers to " + res.snapshotLength + " links on " + win.location.href + " in " + (endTime-startTime) + "ms");
  }
  
  // Snarf the authentication hash using wrappedJSObject
  // This should be safe, since Firefox 3 uses a XPCSafeJSObjectWrapper
  // See http://developer.mozilla.org/en/docs/XPConnect_wrappers#XPCSafeJSObjectWrapper
  this.API.auth.snarfAuthInfo(doc, win);
  
  // Update alert state
  let mailIcon = doc.getElementById("mail");
  if (mailIcon) {
    let hasMail = mailIcon.className == "havemail";
    if (hasMail != this.alertState) {
      logger.log("RedditSite", this.siteName, "Reddit orangered envelope differs from alert state. Refreshing alert state.");
      this.alertState = hasMail;
      this.refreshAlertState();
    }
  }
};

RedditSite.prototype.linkClicked = function(event) {
  let link = event.target;
  let doc = link.ownerDocument;
  let linkURL = link.href;
  
  // Scrape the thing ID of the reddit link.
  let thingElement, linkFullname;
  if (this.API.version["dom"] != "0.0") {
    thingElement = getThingParent(link);
    linkFullname = getThingID(thingElement);
  } else {
    // Remove title_ from title_XX_XXXXX
    linkFullname = link.id.slice(6);
    thingElement = doc.getElementById("thingrow_"+linkFullname);
  }
  
  // If the link is currently watched, use the existing data.
  // Otherwise, scrape some initial data and create a new watch.
  if (Socialite.watchedURLs.isWatchedBy(linkURL, this) &&
      Socialite.watchedURLs.getBy(linkURL, this).fullname == linkFullname) {
    
    // Ensure that the URL isn't hidden
    Socialite.watchedURLs.get(linkURL).activate();
  } else {
    // Create the linkInfo object.
    let linkInfo = new RedditLinkInfo(this.API, linkURL, linkFullname);

    try {
      // Get some "preloaded" information from the page while we can.
      linkInfo.localState.title = link.textContent;
      this.scrapeLinkInfo(thingElement, linkInfo);
      logger.log("RedditSite", this.siteName, "Read link info from DOM (id:"+linkFullname+"): " + linkInfo.localState.toString());
    } catch (e) {
      logger.log("RedditSite", this.siteName, "Caught exception while reading link info (id:"+linkFullname+") from DOM: " + e.toString());
    }
    
    // Add the information we collected to the watch list.
    Socialite.watchedURLs.watch(linkInfo.url, this, linkInfo, true);
  }
};

RedditSite.prototype.scrapeLinkInfo = function(thingElement, linkInfo) {
  let doc = thingElement.ownerDocument;
  
  let isV0 = this.API.version["dom"] == "0.0";
  let isV1 = this.API.version["dom"] == "1.0";

  //
  // Score and vote status
  //
  let linkLiked, linkDisliked, scoreSpan;
  if (isV0) {
    let linkLike = doc.getElementById("up_"+linkInfo.fullname);
    linkLiked = /upmod/.test(linkLike.className);
    
    let linkDislike = doc.getElementById("down_"+linkInfo.fullname);
    linkDisliked = /downmod/.test(linkDislike.className);
    
    scoreSpan = doc.getElementById("score_"+linkInfo.fullname);
  } else {
    scoreSpans = thingElement.getElementsByClassName("score");
    if (isV1) {
      scoreSpan = scoreSpans[0];
    } else {
      // Find the visible score span.
      scoreSpan = Array.filter(scoreSpans, function(elem) {
        return doc.defaultView.getComputedStyle(elem, null).display != "none";
      })[0];
    }
    linkLiked = /\blikes\b/.test(scoreSpan.className);
    linkDisliked = /\bdislikes\b/.test(scoreSpan.className);
  }
  
  if (linkLiked) {
    linkInfo.localState.isLiked = true;
  } else if (linkDisliked) {
    linkInfo.localState.isLiked = false;
  } else {
    linkInfo.localState.isLiked = null;
  }
  linkInfo.localState.score = parseInt(scoreSpan.textContent);
  
  //
  // Subreddit
  //
  let linkSubreddit;
  if (isV0) {
    linkSubreddit = doc.getElementById("subreddit_"+linkInfo.fullname);
  } else {
    linkSubreddit = thingElement.getElementsByClassName("subreddit")[0];
  }
  if (linkSubreddit != null) {
    // The subreddit can be missing from the listing if we're in a subreddit page
    linkInfo.localState.subreddit = linkSubreddit.textContent;
  }

  //
  // Comment count
  //
  let linkComments;
  if (isV0) {
    linkComments = doc.getElementById("comment_"+linkInfo.fullname);
  } else {
    linkComments = thingElement.getElementsByClassName("comments")[0];
  }
  
  let commentNum = parseInt(linkComments.textContent);
  if (commentNum) {
    linkInfo.localState.commentCount = parseInt(commentNum);
  } else {
    linkInfo.localState.commentCount = 0;
  }
  
  //
  // Saved status
  //
  
  if (isV0) {
    // XXX The second cases only exist to support older installations of reddit
    let linkSave = doc.getElementById("a_save_"+linkInfo.fullname) || doc.getElementById("save_"+linkInfo.fullname+"_a");
    let linkUnsave = doc.getElementById("a_unsave_"+linkInfo.fullname) || doc.getElementById("unsave_"+linkInfo.fullname+"_a");
    
    if (linkSave != null) {
      // If there's a save link
      // Whether it's clicked
      linkInfo.localState.isSaved = (linkSave.style.display == "none");
    } else if (linkUnsave != null) {
      // If there's an unsave link (assumption)
      // Whether it's not clicked
      linkInfo.localState.isSaved = (linkUnsave.style.display != "none");
    } else {
      // No save or unsave link present -- this shouldn't happen, as far as I know.
      logger.log("RedditSite", this.siteName, "Unexpected save link absence.");
    }
  } else {
    linkInfo.localState.isSaved = (thingElement.className.indexOf("saved") != -1);
  }
  
  //
  // Hidden status
  //
  let linkHide, linkUnhide;
  if (isV0) {
    // You might assume that if link was hidden, the user couldn't have clicked on it
    // -- but they could find it in their hidden links list.
    linkHide = doc.getElementById("a_hide_"+linkInfo.fullname) || doc.getElementById("hide_"+linkInfo.fullname+"_a");
    linkUnhide = doc.getElementById("a_unsave_"+linkInfo.fullname) || doc.getElementById("unsave_"+linkInfo.fullname+"_a");
    
    // Unlike the save button, when the hide button is clicked, the post disappears.
    // Thus, we needn't worry about the clicked state.
    if (linkHide != null) {
      linkInfo.localState.isHidden = false;
    } else if (linkUnhide != null) {
      linkInfo.localState.isHidden = true;
    } else {
      // No hide or unhide link present -- this shouldn't happen, as far as I know.
      logger.log("RedditSite", this.siteName, "Unexpected hide link absence.");
    }
  } else {
    linkInfo.localState.isHidden = (thingElement.className.indexOf("hidden") != -1);
  }
}

RedditSite.prototype.getLinkInfo = function(URL, callback) {
  var infoCall = this.API.urlinfo(
    hitchThis(this, function success(r, json) {
      if (json.data.children.length > 0) {
        var linkInfo = RedditLinkInfoFromJSON(this.API, json);
        Socialite.watchedURLs.watch(URL, this, linkInfo);
        callback(linkInfo);
      } else {
        callback(null);
      }
    }),
    function failure(r) { callback(null); }
  );
  
  // We supply null since we do not know the subreddit.
  infoCall.perform(URL, null);
};


RedditSite.prototype.createBarContentUI = function(document, linkInfo) {
  var barContent = document.createElement("hbox");
  barContent.setAttribute("flex", "1");
  
  barContent.siteID = this.siteID;
  barContent.linkInfo = linkInfo;
  barContent.sitePreferences = this.sitePreferences;
  
  // We define behaviors here since I intend the RedditBarContent XBL to only be responsible for the display of a RedditLinkInfo instance.
  // In other words, we'll treat it more like a support widget and define handlers for its commands here. This is helpful because the scripting scope in XBL is limited.
  // FIXME: We'll use this 'afterBound' hack because I'm tired of trying to figure out how to make XBL apply synchronously.
  let site = this;
  barContent.afterBound = function() {
    // Action failure handlers for info updates are disabled because the messages are too frequent and unhelpful.
    this.refreshCallback = function(omit) {
      if (!omit) {
        omit = [];
      }
        
      barContent.linkInfo.update(
        hitchThis(barContent, barContent.update)/*,
        hitchThis(site, site.actionFailureHandler)*/
      ).perform(omit);
    };
    
    let updateHandler = function() {
      barContent.refresh();
    };
    let voteUpdateHandler = function() {
      barContent.refresh(["score"]);
    };
    
    let failureHandler = function(r, action) {
      barContent.update();
      site.actionFailureHandler(r, action);
    };
    
    let subredditURL = function() {
      if (barContent.linkInfo.localState.subreddit) {
        return site.siteURL+"r/"+barContent.linkInfo.localState.subreddit+"/";
      } else {
        return site.siteURL;
      }
    };
    
    this.labelScore.addEventListener("click", function(e) {
      barContent.refresh();
    }, false);
    
    this.labelSubreddit.addEventListener("click", function(e) {
      Socialite.utils.openUILink(subredditURL(), e);
    }, false);
    
    this.buttonLike.addEventListener("click", function(e) {
      let vote = barContent.linkInfo.vote(
        voteUpdateHandler,
        failureHandler
      );
      if (barContent.linkInfo.localState.isLiked == true) {
        vote.perform(null);
      } else {
        vote.perform(true);
      }
      barContent.update();
    }, false);
    
    this.buttonDislike.addEventListener("click", function(e) {
      let vote = barContent.linkInfo.vote(
        voteUpdateHandler,
        failureHandler
      );
      if (barContent.linkInfo.localState.isLiked == false) {
        vote.perform(null);
      } else {
        vote.perform(false);
      }
      barContent.update();
    }, false);
    
    this.buttonComments.addEventListener("click", function(e) {
      Socialite.utils.openUILink(subredditURL()+"comments/"+barContent.linkInfo.getID()+"/", e);
    }, false);
    
    this.buttonSave.addEventListener("click", function(e) {
      let modify;
      if (barContent.linkInfo.localState.isSaved) {
        modify = barContent.linkInfo.unsave(
          updateHandler,
          failureHandler
        );
      } else {
        modify = barContent.linkInfo.save(
          updateHandler,
          failureHandler
        );
      }
      modify.perform();
      barContent.update();
    }, false);
    
    this.buttonHide.addEventListener("click", function(e) {
      let modify;
      if (barContent.linkInfo.localState.isHidden) {
        modify = barContent.linkInfo.unhide(
          updateHandler,
          failureHandler
        );
      } else {
        modify = barContent.linkInfo.hide(
          updateHandler,
          failureHandler
        );
      }
      modify.perform();
      barContent.update();
    }, false);
    
    this.buttonRandom.addEventListener("click", function(e) {
      site.API.randomrising(
        function (r, json) {
          let linkInfo = RedditLinkInfoFromJSON(site.API, json);
          Socialite.watchedURLs.watch(linkInfo.url, site, linkInfo);
          Socialite.utils.openUILink(linkInfo.url, e);
        },
        failureHandler
      ).perform();
    }, false);
    
    this.buttonProfile.addEventListener("click", function(e) {
      barContent.linkInfo.API.auth.getAuthInfo(function(authInfo) {
        Socialite.utils.openUILink(subredditURL()+"user/"+authInfo.username+"/", e);
      }).perform();
    }, false);
    
    this.buttonLogin.addEventListener("click", function(e) {
      Socialite.utils.openUILinkIn(site.siteURL + "login/", "tab");
    }, false);
  };
  
  barContent.style.MozBinding = "url(chrome://socialite/content/reddit/redditBar.xml#reddit-content-ui)"; 
  return barContent;
};

RedditSite.prototype.createBarSubmitUI = function(document) {
  var barSubmit = document.createElement("hbox");
  barSubmit.setAttribute("flex", "1");
  
  function hideSubreddits() {
    if (barSubmit.parentNode != null) {
      barSubmit.menulistSubreddit.hidden = true;
    }
  }
  
  var site = this;
  barSubmit.afterBound = function() {
    // Get subreddit listing and initialize menu
    site.cached.mysubreddits(
      function success(r, json) {
        // Check that the bar hasn't been removed
        if (barSubmit.parentNode != null) {
          if (json) {
            
            // Sort the subreddits like on the submit page.
            json.data.children.sort(subredditSort);
            
            if (json.data.children.length == 0) {
              Socialite.utils.siteFailureMessage(site, "createBarSubmitUI", stringBundle.GetStringFromName("failureMsg.noSubreddits"));
              barSubmit.menulistSubreddit.hidden = true;
            } else {
              for each (var subredditInfo in json.data.children) {
                let subredditURL = subredditInfo.data.url;
                let subredditURLName = /^\/r\/(.+)\/$/.exec(subredditURL)[1];
                
                // Remove the '/' at the beginning
                subredditURL = subredditURL.substring(1);
                
                barSubmit.menulistSubreddit.appendItem(subredditURLName, subredditURL);
              }
              
              barSubmit.menulistSubreddit.selectedIndex = 0;
            }
            
          } else {
            // No JSON data returned: the user is probably logged out.
            hideSubreddits();
          }
        }
      },
      hideSubreddits // Silently hide subreddits listing if there was an error fetching the list.
    ).perform();
    
    this.buttonSubmit.addEventListener("command", function(e) {
      var subredditURL;
      if (barSubmit.menulistSubreddit.selectedItem && !barSubmit.hidden) {
        subredditURL = barSubmit.menulistSubreddit.selectedItem.value;
      } else {
        // Degrade to general submission page if no subreddit is set.
        subredditURL = "";
      }
      var submitURL = barSubmit.parentNode.URL;
      var submitTitle = barSubmit.textboxTitle.value;
      
      // Use ?resubmit GET parameter so reddit doesn't jump straight to the "already submitted" page
      let formURL = site.siteURL+subredditURL+"submit/?resubmit=true"+
                    "&url="+encodeURIComponent(submitURL)+
                    "&title="+encodeURIComponent(submitTitle);
      
      Socialite.utils.openUILink(formURL, e);
      barSubmit.parentNode.close();
    }, false);
  };
  
  barSubmit.style.MozBinding = "url(chrome://socialite/content/reddit/redditBar.xml#reddit-submit-ui)"; 
  return barSubmit;
};

RedditSite.prototype.createInfoUI = function(document) {
  var redditSiteInfo = document.createElement("hbox");
  redditSiteInfo.site = this;
  redditSiteInfo.className = "reddit-site-info";
  redditSiteInfo.style.MozBinding = "url(chrome://socialite/content/reddit/redditSiteInfo.xml#reddit-site-info)"; 
  return redditSiteInfo;
};

RedditSite.prototype.createPreferencesUI = function(document, propertiesWindow) {
  var propertiesBox = document.createElement("vbox");
  
  function addGroupbox(title) {
    var groupbox = document.createElement("groupbox");
    groupbox.setAttribute("flex", "1");
    
    var groupboxCaption = document.createElement("caption");
    groupboxCaption.setAttribute("label", title);
    groupbox.appendChild(groupboxCaption);
    
    propertiesBox.appendChild(groupbox);
    return groupbox;
  }
  
  function addBooleanPreferenceUI(parent, prefName, defaultValue) {
    var capitalizedName = prefName[0].toUpperCase() + prefName.substr(1);
    var prefID = "pref"+capitalizedName;
    var preference = propertiesWindow.addSitePreference(prefID, prefName, "bool");
    
    checkbox = document.createElement("checkbox");
    checkbox.setAttribute("label", stringBundle.GetStringFromName(prefName+"Preference.label"));
    checkbox.setAttribute("accesskey", stringBundle.GetStringFromName(prefName+"Preference.accesskey"));
    checkbox.setAttribute("preference", prefID);
    preference.setElementValue(checkbox);
    
    parent.appendChild(checkbox);
  }
  
  var generalGroup = addGroupbox(stringBundle.GetStringFromName("generalGroup.caption"));
  addBooleanPreferenceUI(generalGroup, "compactDisplay");
  addBooleanPreferenceUI(generalGroup, "notificationsEnabled");
  
  var displayGroup = addGroupbox(stringBundle.GetStringFromName("displayGroup.caption"));
  addBooleanPreferenceUI(displayGroup, "showScore");
  addBooleanPreferenceUI(displayGroup, "showSubreddit");
  addBooleanPreferenceUI(displayGroup, "showComments");
  addBooleanPreferenceUI(displayGroup, "showSave");
  addBooleanPreferenceUI(displayGroup, "showHide");
  addBooleanPreferenceUI(displayGroup, "showRandom");
  addBooleanPreferenceUI(displayGroup, "showProfile");
    
  return propertiesBox;  
};

RedditSite.prototype.refreshAlertState = function() {
  logger.log("RedditSite", this.siteName, "Refreshing messages and user info.");
  
  // We have a listener changed that will call this function upon username change.
  // It is possible that getAuthInfo could detect a username change, so we must prevent this function from getting called a second time.
  if (!this._refreshingAlertState) {
    let site = this;
    let refresh = this.API.auth.getAuthInfo(function(authInfo) {
      if (authInfo.isLoggedIn) {
        // Check for new messages
        site.API.messages(
          function success(r, json) {
            if (json) {
              site.newMessages = json.data.children.filter(function(message) {
                return message.data.new;
              });
              
              site.alertState = site.newMessages.length > 0;
              site.showMessageNotification();
            }
          }/*,
          this.actionFailureHandler*/
        ).perform(false);
        
        // Update cached user karma info
        site.cached.myuserinfo().perform();
      } else {
        this.alertState = false;
        this.newMessages = [];
        this.lastMessageCount = null;
      }
    });
    
    this._refreshingAlertState = true;
    refresh.finallyCallback = function() {
      site._refreshingAlertState = false;
    };
    refresh.perform();
  }
};

RedditSite.prototype.showMessageNotification = function() {
  if (this.sitePreferences.getBoolPref("notificationsEnabled")) {
    let count = this.newMessages.length;
    if (count > 0 && this.lastNewMessageCount < count) {
      let title;
      if (count == 1) {
        title = stringBundle.formatStringFromName("messageNotification.title-single", [ count, this.siteName ], 2);
      } else {
        title = stringBundle.formatStringFromName("messageNotification.title-plural", [ count, this.siteName ], 2);
      }
      
      Socialite.utils.showNotification(
        title,
        stringBundle.GetStringFromName("messageNotification.message"),
        "chrome://socialite/content/reddit/mail_large.png",
        null,
        RedditNotificationClickHandler,
        this.inboxURL
      );
    }
    this.lastNewMessageCount = this.newMessages.length;
  }
};

RedditSite.prototype.actionFailureHandler = function(r, action) {
  // 5xx error codes
  let text;
  if (r.status >= 500 && r.status < 600) {
    text = stringBundle.GetStringFromName("failureMsg.tryAgain");
  } else {
    text = stringBundle.formatStringFromName("failureMsg.httpStatus", [ r.status ], 1);
  }
  
  Socialite.utils.siteFailureMessage(this, action.name, text);
};

RedditNotificationClickHandler = {
  observe: function(subject, topic, data) {
    if (topic == "alertclickcallback") {
      Socialite.utils.openUILinkIn(data, "tab");
    }
  }
}

// Register this class for instantiation
RedditSite.prototype.siteClassID = "RedditSite";
RedditSite.prototype.siteClassName = "Reddit API";
RedditSite.prototype.siteClassIconURI = "chrome://socialite/content/reddit/reddit.ico";
SiteClassRegistry.addClass(RedditSite);
