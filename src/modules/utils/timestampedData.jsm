// An class that contains a collection of properties, with timestamps for when they were last 

logger = Components.utils.import("resource://socialite/utils/log.jsm");
Components.utils.import("resource://socialite/utils/hitch.jsm");

var EXPORTED_SYMBOLS = ["TimestampedData"];

function TimestampedData() {
  this.fields = [];
  this.values = {};
  this.timestamps = {};
  this.lastUpdated = Date.now();
}

TimestampedData.prototype.addField = function(name, initialValue) {
  if (!initialValue) {
    initialValue = null;
  }
  this.fields.push(name);
  this.values[name] = initialValue;
  this.__defineSetter__(name, hitchHandler(this, "setField", name));
  this.__defineGetter__(name, hitchHandler(this, "getField", name));
  this.timestamps[name] = Date.now();
}

TimestampedData.prototype.getField = function(name) {
  return this.values[name];
}

TimestampedData.prototype.setField = function(name, value) {
  var time = Date.now();
  
  this.values[name] = value;
  
  this.timestamps[name] = time;
  this.lastUpdated = time;
}

TimestampedData.prototype.getTimestamp = function(name) {
  return this.timestamps[name];
}

TimestampedData.prototype.toString = function() {
  return this.values.toSource();
}

/**
 * Copy fields from another TimestampedData instance. If a timestamp is
 * specified, fields will be copied only if the stored value hasn't been updated
 * since the timestamp.
 * 
 * @param data
 *          The instance to copy from.
 * @param fields
 *          The fields to copy from the instance (all fields will be copied if
 *          null).
 * @param timestamp
 *          The timestamp (number of milliseconds since epoch).
 * @param omit
 *          If true, fields given will be omitted and all other fields will be
 *          copied.
 */
TimestampedData.prototype.copy = function(data, fields, timestamp, omit) {
  if (omit) {
    if (fields) {
      // Copy all fields except those omitted
      var copiedFields = data.fields.filter(function(field) {
        return fields.indexOf(field) == -1; 
      });
    } else {
      // Shortcut if no omitted fields are given 
      copiedFields = data.fields;
    }
  } else {
    if (!fields) {
      // Default to copying all fields
      fields = data.fields;
    }
    // Copy only the fields required
    var copiedFields = fields;
  }
  
  copiedFields.forEach(function(field, index, array) {
    // If the stored value hasn't been updated since the timestamp, copy it.
    if ((field in this) && 
       ((timestamp == null) || (timestamp >= this.getTimestamp(field)))) {
      this[field] = data[field];
    } else {
      // Modified since revert timestamp, skipping copy.
    }
  }, this);
  
}
