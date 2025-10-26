/**
 * Minimal event emitter implementation shared across environments.
 */

function EventEmitter() {
  this._events = Object.create(null);
}

EventEmitter.prototype.on = EventEmitter.prototype.addListener = function (type, listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('listener must be a function');
  }
  var events = this._events;
  var list = events[type];
  if (!list) {
    events[type] = [listener];
  } else {
    list.push(listener);
  }
  return this;
};

EventEmitter.prototype.once = function (type, listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('listener must be a function');
  }

  var self = this;
  function wrapped() {
    self.removeListener(type, wrapped);
    listener.apply(this, arguments);
  }
  wrapped._listener = listener;
  return this.on(type, wrapped);
};

EventEmitter.prototype.emit = function (type) {
  var events = this._events;
  var list = events[type];
  if (!list || !list.length) {
    return false;
  }

  var args = Array.prototype.slice.call(arguments, 1);
  // Copy to guard against mutations during emit.
  list = list.slice();
  for (var i = 0; i < list.length; i++) {
    list[i].apply(this, args);
  }
  return true;
};

EventEmitter.prototype.removeListener = EventEmitter.prototype.off = function (type, listener) {
  var events = this._events;
  var list = events[type];
  if (!list) {
    return this;
  }

  if (!listener) {
    delete events[type];
    return this;
  }

  for (var i = list.length - 1; i >= 0; i--) {
    var fn = list[i];
    if (fn === listener || fn._listener === listener) {
      list.splice(i, 1);
    }
  }
  if (!list.length) {
    delete events[type];
  }
  return this;
};

EventEmitter.prototype.removeAllListeners = function (type) {
  if (type === undefined) {
    this._events = Object.create(null);
  } else {
    delete this._events[type];
  }
  return this;
};

EventEmitter.prototype.listeners = function (type) {
  var list = this._events[type];
  return list ? list.slice() : [];
};

EventEmitter.prototype.listenerCount = function (type) {
  var list = this._events[type];
  return list ? list.length : 0;
};

export default EventEmitter;
