// Abstracts the general form of an XMLHttpRequest handler into an action.

logger = Components.utils.import("resource://socialite/utils/log.jsm");
Components.utils.import("resource://socialite/utils/action/action.jsm");

var EXPORTED_SYMBOLS = ["RequestAction", "GetAction", "PostAction"];

STATUS_SUCCESS = 200;

function RequestAction(method, url, parameters, successCallback, failureCallback) {
  let act = _HTTPRequestAction(successCallback, failureCallback);
  
  act.url = url;
  
  if (method) {
    method = method.toLowerCase()
    if ((method == "post") ||
       (method == "get" )) {
      act.method = method;
    } else {
      throw "HTTPRequestAction: invalid XMLHttpRequest method specified.";
    }
  } else {
    // Default
    act.method = "post";
  }
  
  if (parameters) {
    act.parameters = parameters;
  } else {
    act.parameters = {};
  }
  
  act.request = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
  
  return act;
}

function GetAction(url, parameters, successCallback, failureCallback) {
  return RequestAction("get", url, parameters, successCallback, failureCallback);
}

function PostAction(url, parameters, successCallback, failureCallback) {
  return RequestAction("post", url, parameters, successCallback, failureCallback);
}

// Based on code from reddit.com javascript:
// From http://code.reddit.com/browser/r2/r2/public/static/utils.js
// Modified by chromakode to merge in and remove prototyped Object.__iter__
function make_get_params(obj) {
  let res = [];
  for (let o in obj) {
    if(!(o in Object.prototype)) {
      res.unshift( o+"="+encodeURIComponent(obj[o]) );
    }
  }
  return res.join("&");
}

var _HTTPRequestAction = Action("httpRequest", function(action) {
  let onLoad = function(e) {
    let request = e.target;
    if (request.status == STATUS_SUCCESS) {
      action.success(request);
    } else {
      action.failure(request);
    }
  };
  
  let formattedParams = make_get_params(action.parameters);
  
  if (action.method == "get") {
    let target = action.url;
    if (formattedParams) {
      target += "?" + formattedParams;
    }
    logger.log("httpRequest", "GET request to " + target);
    action.request.open("get", target, true);
    action.request.onload = onLoad;
    action.request.send(null);
  } else if (action.method == "post") {
    action.request.open("post", action.url, true);
    action.request.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    action.request.onload = onLoad;
    logger.log("httpRequest", "POST to " + action.url + " (sent: " + formattedParams +  ")");
    action.request.send(formattedParams);
  }
});
