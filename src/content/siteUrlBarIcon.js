SocialiteWindow.SiteUrlBarIcon = (function() {
  let modules = {};
  let importModule = function(name) Components.utils.import(name, modules);
  
  let Socialite = importModule("resource://socialite/socialite.jsm").Socialite;
  let logger = importModule("resource://socialite/utils/log.jsm");
  let domUtils = importModule("resource://socialite/utils/domUtils.jsm");
  
  var SiteUrlBarIcon = {
    SITE_URLBARICON_ID: "socialite-site-urlbar-icon-",
    SITE_URLBARICON_CLASS: "socialite-site-urlbar-icon",
    URLBARICON_CLASS: "socialite-urlbar-icon",
    
    GENERAL_ICON: "chrome://socialite/skin/socialite_small.png",
    GENERAL_URLBARICON_ID: "socialite-urlbar-icon",
    
    onLoad: function() {
      this.generalIcon = this.createGeneral();
      for (let [siteID, site] in Socialite.sites) {
        this.create(site);
      }
    },
    
    onUnload: function() {
      Array.forEach(this.getAll(), function(siteUrlBarIcon) {
        siteUrlBarIcon.destroyUrlBarIcon();
      });
    },
    
    create: function(site) {
      let urlBarIconParent = document.getElementById("urlbar-icons");
      let feedButton = document.getElementById("feed-button");
      let urlBarIcon = document.createElement("hbox");
      
      urlBarIcon.site = site;
      urlBarIcon.id = this.SITE_URLBARICON_ID + site.siteID;
      urlBarIcon.className = [this.URLBARICON_CLASS, this.SITE_URLBARICON_CLASS, "urlbar-icon"].join(" ");
      
      urlBarIcon.addEventListener("click", SiteUrlBarIcon.handleClick, false);
      urlBarIcon.addEventListener("SocialiteEmblemClick", function(e) {
        Socialite.utils.openUILink(site.inboxURL, e);
      }, false);
      
      let infoTooltip = document.createElement("tooltip");
      infoTooltip.className = "socialite-site-info-tooltip";
      infoTooltip.afterBound = function() {
        infoTooltip.addSite(site);
      }
      urlBarIcon.appendChild(infoTooltip);
      // Hide the icon before we add and position it.
      urlBarIcon.setAttribute("hidden", true);
      
      urlBarIconParent.insertBefore(urlBarIcon, feedButton);
      this.updateSiteName(site, site.siteName);
      
      urlBarIcon.updateVisibility = function(visible, consolidated) {
        urlBarIcon.setAttribute("hidden", !visible || consolidated);
      }
      urlBarIcon.updateVisibility(
        Socialite.preferences.getBoolPref("showSiteUrlBarIcons"), 
        Socialite.preferences.getBoolPref("consolidateSites")
      );
      
      return urlBarIcon;
    },
    
    createGeneral: function() {
      let urlBarIconParent = document.getElementById("urlbar-icons");
      let feedButton = document.getElementById("feed-button");
      let urlBarIcon = document.createElement("hbox");
      
      urlBarIcon.id = this.GENERAL_URLBARICON_ID;
      urlBarIcon.className = [this.URLBARICON_CLASS, "urlbar-icon"].join(" ");
      
      urlBarIcon.icon = SiteUrlBarIcon.GENERAL_ICON;
      urlBarIcon.setAttribute("src", SiteUrlBarIcon.GENERAL_ICON); // Necessary since the XBL may not have loaded yet
      urlBarIcon.name = Socialite.stringBundle.GetStringFromName("generalUrlBarIcon.tooltip");
     
      urlBarIcon.updateVisibility = function(visible, consolidated) {
        urlBarIcon.setAttribute("hidden", !visible || !consolidated);
      }
      urlBarIcon.updateVisibility(
        Socialite.preferences.getBoolPref("showSiteUrlBarIcons"), 
        Socialite.preferences.getBoolPref("consolidateSites")
      );
      
      urlBarIcon.addEventListener("click", SiteUrlBarIcon.handleClick, false);
      
      urlBarIconParent.insertBefore(urlBarIcon, feedButton);
      
      return urlBarIcon;
    },
  
    get: function(site) {
      return document.getElementById(this.SITE_URLBARICON_ID + site.siteID);
    },
    
    getAll: function() {
      return document.getElementsByClassName(this.SITE_URLBARICON_CLASS);
    },
    
    remove: function(site) {
      let urlBarIconParent = document.getElementById("urlbar-icons");
      let urlBarIcon = this.get(site);
      urlBarIcon.destroyUrlBarIcon();
      urlBarIconParent.removeChild(urlBarIcon)
    },
    
    updateSiteName: function(site, newSiteName) {
      let urlBarIcon = this.get(site);
      let feedButton = document.getElementById("feed-button");
      let urlBarIconParent = document.getElementById("urlbar-icons");
      
      urlBarIcon.name = newSiteName;

      let urlBarIcons = SiteUrlBarIcon.getAll();
      if (urlBarIcons.length == 0) {
        urlBarIconParent.insertBefore(urlBarIcon, feedButton);
      } else {
        domUtils.insertSorted(urlBarIcon, urlBarIcons, domUtils.compareBy(function(e) e.name));
      }
    },
    
    updateVisibility: function() {
      let visible = Socialite.preferences.getBoolPref("showSiteUrlBarIcons");
      let consolidated = Socialite.preferences.getBoolPref("consolidateSites");
      this.generalIcon.updateVisibility(visible, consolidated);
      Array.forEach(this.getAll(), function(urlBarIcon) {
        urlBarIcon.updateVisibility(visible, consolidated);
      });
    },
    
    refreshUrlBarIcons: function() {
      Array.forEach(this.getAll(), function(siteUrlBarIcon) {
        siteUrlBarIcon.refresh();
      });
    },
    
    handleClick: function(event) {
      urlBarIcon = event.target;
      if (!urlBarIcon.isWorking && event.button != 2) {
        urlBarIcon.setWorking(true);
        SocialiteWindow.linkContextAction(urlBarIcon.site, event, false, function finished() {
          urlBarIcon.setWorking(false);
        });
      }
    }
  };
  
  return SiteUrlBarIcon;
})();