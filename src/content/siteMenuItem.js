SocialiteWindow.SiteMenuItem = (function() {
  let modules = {};
  let importModule = function(name) Components.utils.import(name, modules);
  
  let Socialite = importModule("resource://socialite/socialite.jsm").Socialite;
  let logger = importModule("resource://socialite/utils/log.jsm");
  let faviconWatch = importModule("resource://socialite/utils/faviconWatch.jsm");
  let domUtils = importModule("resource://socialite/utils/domUtils.jsm"); 
  
  var SiteMenuItem = {
    SITE_MENUITEM_ID: "socialite-site-menuitem-",
    SITE_MENUITEM_CLASS: "socialite-site-menuitem",
    MENUITEM_CLASS: "socialite-menuitem",
    
    GENERAL_ICON: "chrome://socialite/content/socialite_small.png",
    GENERAL_MENUITEM_ID: "socialite-menuitem",
    
    onLoad: function() {
      this.generalItem = this.createGeneral();
      for (let [siteID, site] in Socialite.sites) {
        this.create(site);
      }
    },
    
    onUnload: function() {
      Array.forEach(this.getAll(), function(menuItem) {
        if (menuItem._removeFaviconWatch) { menuItem._removeFaviconWatch(); }
      });
    },
    
    create: function(site) {
      let fileMenuPopup = document.getElementById("menu_FilePopup");
      let sendMenuItem = document.getElementById("menu_sendLink");
      let menuItem = document.createElement("menuitem");
      
      menuItem.id = this.SITE_MENUITEM_ID + site.siteID;
      menuItem.className = [this.SITE_MENUITEM_CLASS, this.MENUITEM_CLASS].join(" ");
      menuItem._removeFaviconWatch = faviconWatch.useFaviconAsAttribute(menuItem, "image", site.siteURL);
      
      menuItem.updateVisibility = function(visible, consolidated) {
        menuItem.setAttribute("hidden", !visible || consolidated);
      }
      menuItem.updateVisibility(
        Socialite.preferences.getBoolPref("showSiteMenuItems"),
        Socialite.preferences.getBoolPref("consolidateSites")
      );
      
      menuItem.addEventListener("command", function(event) {
        SocialiteWindow.linkContextAction(site, event, true);
      }, false);
      
      menuItem.updateSiteName = function(newSiteName) {
        menuItem.setAttribute("label", Socialite.stringBundle.formatStringFromName("shareMenuItem.label", [ newSiteName ], 1));
        
        let menuItems = SiteMenuItem.getAll();
        if (menuItems.length == 0) {
          fileMenuPopup.insertBefore(menuItem, sendMenuItem.nextSibling);
        } else {
          domUtils.insertSorted(menuItem, menuItems, domUtils.compareBy(function(e) e.getAttribute("label")));
        }
      }
      menuItem.updateSiteName(site.siteName);
      
      return menuItem;
    },
    
    createGeneral: function() {
      let fileMenuPopup = document.getElementById("menu_FilePopup");
      let sendMenuItem = document.getElementById("menu_sendLink");
      let menuItem = document.createElement("menuitem");
      
      menuItem.id = this.GENERAL_MENUITEM_ID;
      menuItem.className = this.MENUITEM_CLASS;
      menuItem.setAttribute("src", SocialiteWindow.SiteUrlBarIcon.GENERAL_ICON);
      menuItem.setAttribute("label", Socialite.stringBundle.GetStringFromName("generalMenuItem.label"));
      
      menuItem.updateVisibility = function(visible, consolidated) {
        menuItem.setAttribute("hidden", !visible || !consolidated);
      }
      menuItem.updateVisibility(
        Socialite.preferences.getBoolPref("showSiteMenuItems"),
        Socialite.preferences.getBoolPref("consolidateSites")
      );
      
      menuItem.addEventListener("command", function(event) {
        SocialiteWindow.linkContextAction(null, event, true);
      }, false);
      
      fileMenuPopup.insertBefore(menuItem, sendMenuItem.nextSibling);
      
      return menuItem;
    },
    
    get: function(site) {
      return document.getElementById(this.SITE_MENUITEM_ID + site.siteID);
    },
    
    getAll: function() {
      return document.getElementsByClassName(this.SITE_MENUITEM_CLASS);
    },
    
    remove: function(site) {
      let fileMenuPopup = document.getElementById("menu_FilePopup");
      let menuItem = this.get(site);
      if (menuItem._removeFaviconWatch) { menuItem._removeFaviconWatch(); }
      fileMenuPopup.removeChild(menuItem);
    },
    
    updateSiteName: function(site, newSiteName) {
      let menuItem = this.get(site);
      menuItem.updateSiteName(newSiteName);
    },
    
    updateVisibility: function() {
      let visible = Socialite.preferences.getBoolPref("showSiteMenuItems");
      let consolidated = Socialite.preferences.getBoolPref("consolidateSites");
      this.generalItem.updateVisibility(visible, consolidated);
      Array.forEach(this.getAll(), function(menuItem) {
        menuItem.updateVisibility(visible, consolidated);
      });
    }
  };
  
  return SiteMenuItem;
})();