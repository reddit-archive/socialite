var EXPORTED_SYMBOLS = ["String", "strStartsWith", "strEndsWith"];

function strStartsWith(str1, str2) {
  return str1.substring(0, str2.length) == str2;
}

String.prototype.startsWith = function(strCheck) {
  return strStartsWith(this, strCheck);
}

function strEndsWith(str1, str2) {
  var occurence = str1.lastIndexOf(str2); 
  return (occurence != -1) && (occurence == (str1.length - str2.length));
}

String.prototype.endsWith = function(strCheck) {
  return strEndsWith(this, strCheck);
}
