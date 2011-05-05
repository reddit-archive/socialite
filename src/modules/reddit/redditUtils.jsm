var EXPORTED_SYMBOLS = ["subredditSort", "removeWebSafeEntities", "getThingParent", "getThingID"];

let XPathResult = Components.interfaces.nsIDOMXPathResult;

/**
 * Sort subreddits in the "Asciibetical" ordering, with the "reddit.com"
 * subreddit first, as seen in the submit page dropdown.
 * 
 * @param a
 * @param b
 * @return the comparison between items a and b.
 */
function subredditSort(a, b) {
  if (a.data.url == "/r/reddit.com/") {
    return -1;
  } else if (b.data.url == "/r/reddit.com/") {
    return 1;
  } else {
    if (a.data.url < b.data.url) {
      return -1;
    } else if (a.data.url > b.data.url) {
      return 1;
    } else {
      return 0;
    }
  }
}

/**
 * Undo HTML entity conversion in "python_websafe_json" from reddit's filters.py
 */
function removeWebSafeEntities(s) {
  return s.replace("&amp;", "&", "g").replace("&lt;", "<", "g").replace("&gt;", ">", "g").replace("&quot;", "\"", "g");
}

/**
 * Locate the parent element (with the "thing" class) of an element in the DOM.
 * 
 * @param element
 *          the element in a reddit page associated with a thing.
 * @return the parent element having the "thing" class.
 */
function getThingParent(element) {
  let res = element.ownerDocument.evaluate('ancestor-or-self::*[contains(concat(" ",normalize-space(@class), " "), " thing ")]',
                                           element, null, XPathResult.ANY_UNORDERED_NODE_TYPE, null);
  return res.singleNodeValue;
}

/**
 * Get the reddit thing ID from a thing element in the DOM.
 * 
 * @param element
 *          a thing element or descendant of a thing element in the DOM.
 * @return the ID of the related thing.
 */
function getThingID(thingElement) {
  const thingID = /\s*id-(\S+)\s*/;
  let match = thingElement.className.match(thingID);
  if (match == null) {
    thingElement = getThingParent(thingElement);
    match = thingElement.className.match(thingID);
  }
  if (match == null) {
    return null;
  }
  
  return match[1];
}