var EXPORTED_SYMBOLS = ["insertSorted", "addSorted", "insertListboxSorted", "getChildByClassName"];

let XPathResult = Components.interfaces.nsIDOMXPathResult;

function insertSorted(insertElement, nodeList, compareFunc) {
  let i, curElement;
  for (i=0; i<nodeList.length; i++) {
    curElement = nodeList[i];
    
    // Iterate until the current element is greater than the element to insert
    if (compareFunc(insertElement, curElement) < 0) {
      break;
    }
  }
  
  let parentElement = curElement.parentNode;
  if (i == nodeList.length) {
    // Insert after the last node
    parentElement.insertBefore(insertElement, curElement.nextSibling);
  } else {
    parentElement.insertBefore(insertElement, curElement);
  }
}

function addSorted(insertElement, parentElement, compareFunc) {
  if (parentElement.hasChildNodes()) {
    insertSorted(insertElement, parentElement.childNodes, compareFunc);
  } else {
    parentElement.appendChild(insertElement);
  }
}

function insertListboxSorted(insertElement, listbox, compareFunc) {
  // Listbox elements are annoying because listhead and listcols are siblings to the list items.
  if (listbox.getRowCount() == 0) {
    listbox.appendChild(insertElement);
  } else {
    insertSorted(insertElement, listbox.getElementsByTagName("listitem"), compareFunc);
  }
}

function compareBy(keyFunction) {
  return function(item1, item2) {
    let key1 = keyFunction(item1);
    let key2 = keyFunction(item2);
    return key1.localeCompare(key2);
  };
}

function sortChildren(parentElement, compareFunc) {
  sorted = Array.sort(Array.slice(parentElement.childNodes), compareFunc)
  
  let parentElement = curElement.parentNode;
  if (i == nodeList.length) {
    // Insert after the last node
    parentElement.insertBefore(insertElement, curElement.nextSibling);
  } else {
    parentElement.insertBefore(insertElement, curElement);
  }
}

/**
 * Return the first child node of an element with the specified class.
 * 
 * @param element
 * @param className
 * @return the first child node with the specified class
 */
function getChildByClassName(element, className) {
  // Tricksy normalize-space technique via: http://dubinko.info/blog/2007/10/01/simple-parsing-of-space-seprated-attributes-in-xpathxslt/
  
  let res = element.ownerDocument.evaluate('descendant::*[contains(concat(" ",normalize-space(@class), " "), " '+className+' ")]',
                                           element, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  return res.singleNodeValue;
}