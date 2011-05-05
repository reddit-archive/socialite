var SocialiteSiteProperties = (function() {
  let modules = {};
  let importModule = function(name) Components.utils.import(name, modules);
  
  let Socialite = importModule("resource://socialite/socialite.jsm").Socialite;
  let SiteClassRegistry = importModule("resource://socialite/site.jsm").SiteClassRegistry;
  
  let IOService = Components.classes["@mozilla.org/network/io-service;1"]
                  .getService(Components.interfaces.nsIIOService);
  
  var SocialiteSiteProperties = {
  
    init: function SSProps_init() {
      this.prefWindow = document.getElementById("socialiteSiteProperties");
      this.buttonAccept = this.prefWindow._buttons.accept;
      
      this.strings = document.getElementById("socialiteSitePropertiesStrings");
    
      this.isNewSite = window.arguments[0].isNewSite;
      if (this.isNewSite) {
        this.siteID = Socialite.sites.requestID();
      } else {
        this.site = window.arguments[0].site;
        this.siteID = this.site.siteID;
      }
      this.newSiteInfo = window.arguments[0].newSiteInfo;
      
      // Set up preferences for the site
      this.preferences = document.getElementById("preferencesSocialite");
      
      // Site name and URL preferences
      this.textboxSiteName = document.getElementById("textboxSiteName");    
      this.textboxSiteURL = document.getElementById("textboxSiteURL");
      this.labelSiteURLError = document.getElementById("labelSiteURLError");
      
      this.prefSiteName = this._addBaseSitePreference("prefSiteName", "siteName", "string");
      this.prefSiteURL = this._addBaseSitePreference("prefSiteURL", "siteURL", "string");
      
      // Site class dropdown menu initialization (populate)
      let buttonSiteClass = document.getElementById("buttonSiteClass");
      let menuSiteClass = document.getElementById("menuSiteClass");
      for each (let siteClass in SiteClassRegistry.classes) {
        let menuItem = document.createElement("menuitem");
        
        menuItem.setAttribute("class", "menuitem-iconic");
        menuItem.setAttribute("label", siteClass.prototype.siteClassName);
        menuItem.setAttribute("image", siteClass.prototype.siteClassIconURI);
        menuItem.setAttribute("value", siteClass.prototype.siteClassID);
        
        menuSiteClass.appendChild(menuItem);
      }
         
      // Handler to update preferences pane for site class
      this.boxSiteProperties = document.getElementById("boxSiteProperties");
      buttonSiteClass.addEventListener("ValueChange", function(event) {
        let container = SSProps.boxSiteProperties;
        
        // Remove old pane
        if (container.hasChildNodes()) {
          container.removeChild(container.firstChild);
        }
        
        // Add new pane and reset preferences
        let siteClassID = buttonSiteClass.selectedItem.value;
        SSProps.siteClass = SiteClassRegistry.getClass(siteClassID);
        
        Socialite.sites.setSiteDefaultPreferences(SSProps.siteID, SSProps.siteClass);
        let pane = SSProps.siteClass.prototype.createPreferencesUI(document, SSProps);
        container.appendChild(pane);
      }, false);
      
      // Site class preference initialization
      this.prefSiteClassID = this._addBaseSitePreference("prefSiteClassID", "siteClassID", "string");
      if (this.isNewSite) {
        this.prefSiteClassID.value = menuSiteClass.childNodes.item(0).value;
      } else {
        this.prefSiteClassID.disabled = true; 
      }
      
      // Initial validation and form setup
      this.validate();
    },
    
    _addBaseSitePreference: function SSProps_addBaseSitePreference(prefID, prefName, prefType) {
      let preference = document.createElement("preference");
      preference.setAttribute("id", prefID);
      preference.setAttribute("name", "extensions.socialite.sites."+this.siteID+"."+prefName);
      preference.setAttribute("type", prefType);    
      this.preferences.appendChild(preference);
      return preference;
    },
    
    addSitePreference: function SSProps_addSitePreference(prefID, prefName, prefType) {
      return this._addBaseSitePreference(prefID, this.siteClass.prototype.siteClassID+"."+prefName, prefType);
    },
    
    onAccept: function SSProps_onAccept(event) {
      if (this.isNewSite) {
        // Apparently, any XMLHttpRequests called from this method "disappear" and never call their callbacks because the window closes immediately.
        // Some sites may make XMLHttpRequests (particularly for authentication) when they are loaded, so we must ensure XMLHttpRequests work.
        // Thus, we'll return the information required to create and load the site to the parent preferences window and create the site there.
        this.newSiteInfo["siteClassID"] = this.prefSiteClassID.value;
        this.newSiteInfo["siteID"] = this.siteID;
        this.newSiteInfo["siteName"] = this.prefSiteName.value;
        this.newSiteInfo["siteURL"] = this.prefSiteURL.value;
        return true;
      } else {
        let needsReload = false;
        
        this.site.siteName = this.prefSiteName.value;
        
        let newSiteURL = IOService.newURI(this.prefSiteURL.value, null, null).spec;
        if (this.site.siteURL != newSiteURL) {
          this.site.siteURL = newSiteURL;
          needsReload = true;
        }
        
        if (needsReload) {
          Socialite.sites.reloadSite(this.site); 
        }
        
        return true;
      }
    },
    
    onCancel: function SSProps_onCancel(event) {
      // If we we're cancelling adding a new site, we need to release the ID we requested
      if (this.isNewSite) {
        Socialite.sites.releaseID(this.siteID);
        return true;
      }
    },
    
    validate: function SSProps_validate(event) {
      if ((this.textboxSiteName.value == "") || (this.textboxSiteURL.value == "")) {
        // Short circuit case if either field is empty
        this.labelSiteURLError.value = "";
        this.buttonAccept.disabled = true;
      } else {
        let validURL;
        try {
          IOService.newURI(this.textboxSiteURL.value, null, null);
          validURL = true;
        } catch (e if e.name=="NS_ERROR_MALFORMED_URI") {
          // We were unable to create a URI, so the URL is invalid.
          validURL = false;
        }
        
        if (!validURL) {
          this.labelSiteURLError.value = this.strings.getString("siteURLInvalidError");
          this.buttonAccept.disabled = true;
        } else {
          this.labelSiteURLError.value = "";
          this.buttonAccept.disabled = false;
        }
      }
    }
  
  };
  
  var SSProps = SocialiteSiteProperties;
  return SSProps;
})();