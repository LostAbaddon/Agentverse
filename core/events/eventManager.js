/**
 * Name:	Event Manager
 * Desc:    优化的事件管理器，支持异步事件流式化
 * Author:	LostAbaddon
 * Version:	0.0.4
 * Date:	2017.11.16
 */

const EventEmitter = require('events');
require('../extend');

const createCB = (host, callback) => (...args) => {
	var pack = args.pop();
	if (pack.finished) return true;
	var params = args.copy();
	params.push(pack.event);
	var finished = callback.call(host, ...params);
	pack.finished = !!finished;
	return pack.finished;
};
const createEmitter = (host, eventName) => {
	var left = eventName.substring(1, eventName.length);
	var cap = eventName.substring(0, 1);
	cap = cap.toUpperCase();
	var fullEventName = 'on' + cap + left;
	host[fullEventName] = host[fullEventName] || ((...args) => host.emit(eventName, ...args));
	if (host.host) host.host[fullEventName] = host.host[fullEventName] || ((...args) => {
		host.emit(eventName, ...args);
		return host.host;
	});
};
const createHooker = (host, eventName) => {
	var left = eventName.substring(1, eventName.length);
	var cap = eventName.substring(0, 1);
	cap = cap.toUpperCase();
	var fullEventName = 'look' + cap + left;
	host[fullEventName] = host[fullEventName] || ((...args) => host.on(eventName, ...args));
	if (!!host.host) host.host[fullEventName] = host.host[fullEventName] || ((...args) => {
		host.on(eventName, ...args);
		return host.host;
	});
};

class EventData {
	constructor (eventName, target) {
		this.name = eventName;
		this.data = null;
		this.timestamp = new Date();
		this.target = target;
	}
}
class EventManager {
	constructor (host, events, eventClass, silence = false) {
		if (!events && host instanceof Array) {
			eventClass = events
			events = host;
			host = null;
		}
		var self = this;
		var _ee = new EventEmitter();
		var _events = {};
		var _eventClass = {};
		if (!!eventClass) for (let k in eventClass) {
			let ec = eventClass[k];
			if (ec.isSubClassOf(EventData)) _eventClass[k] = ec;
		}
		Object.defineProperty(this, '_ee', { configurable: false, value: _ee });
		Object.defineProperty(this, '_events', { configurable: false, value: _events });
		Object.defineProperty(this, '_eventClass', { configurable: false, value: _eventClass });
		Object.defineProperty(this, 'silence', { configurable: false, enumerable: true, get: () => silence });

		if (!!host) {
			Object.defineProperty(this, 'host', { configurable: false, value: host });
			if (!host.heart) Object.defineProperty(host, 'heart', { configurable: false, value: self });
			host.on = host.on || ((...args) => { self.on.apply(self, args); return host; });
			host.once = host.once || ((...args) => { self.once.apply(self, args); return host; });
			host.off = host.off || ((...args) => { self.off.apply(self, args); return host; });
			host.clear = host.clear || ((...args)  =>{ self.clear.apply(self, args); return host; });
			host.emit = host.emit || ((...args) => { self.emit.apply(self, args); return host; });
			if (!host.events) Object.defineProperty(host, 'events', { value: self.events });
		}

		if (!silence) (events || []).map(e => {
			createHooker(this, e);
			createEmitter(this, e);
		});
	}
	get events () {
		return Object.keys(this._ee._events);
	}
	on (eventName, callback) {
		var cb = createCB(this, callback);
		this._events[eventName] = this._events[eventName] || { origin:[], cbs: [], is_once: [] }
		this._events[eventName].origin.push(callback);
		this._events[eventName].cbs.push(cb);
		this._events[eventName].is_once.push(false);
		this._ee.on(eventName, cb);
		if (!this.silence) createEmitter(this, eventName);
		return this;
	}
	once (eventName, callback) {
		var cb = createCB(this, callback);
		this._events[eventName] = this._events[eventName] || { origin:[], cbs: [], is_once: [] }
		this._events[eventName].origin.push(callback);
		this._events[eventName].cbs.push(cb);
		this._events[eventName].is_once.push(true);
		this._ee.once(eventName, cb);
		return this;
	}
	off (eventName, callback) {
		var evts = this._events[eventName];
		if (!evts) return this;
		var index = evts.origin.indexOf(callback);
		if (index < 0) return this;
		var cb = evts.cbs[index];
		this._ee.removeListener(eventName, cb);
		evts.origin.splice(index, 1);
		evts.cbs.splice(index, 1);
		evts.is_once.splice(index, 1);
		return this;
	}
	clear (eventName) {
		var evts = this._events[eventName];
		if (!evts) return;
		evts.cbs.forEach(cb => this._ee.removeListener(eventName, cb));
		evts.origin = [];
		evts.cbs = [];
		evts.is_once = [];
		return this;
	}
	emit (eventName, ...args) {
		var ec = this._eventClass[eventName] || this._eventClass.default || EventManager.EventData;
		let event = args[args.length - 1];
		let eventPack;
		if (!(event instanceof EventData)) {
			event = new ec(eventName, this.host || this);
		}
		else {
			event = args.pop();
		}
		eventPack = {
			event: event,
			finished: false
		};
		args.push(eventPack);
		this._ee.emit(eventName, ...args);
		var onces = [];
		var evts = this._events[eventName];
		if (!evts) return this;
		evts.is_once.forEach((is_once, index) => {
			if (is_once) onces.unshift(index);
		});
		if (onces.length === 0) return this;
		onces.forEach(i => {
			evts.origin.splice(i, 1);
			evts.cbs.splice(i, 1);
			evts.is_once.splice(i, 1);
		});
		return this;
	}
};
class AsyncEventManager {
	constructor (host, events, eventClass, silence = false) {
		if (!events && host instanceof Array) {
			eventClass = events
			events = host;
			host = null;
		}
		var self = this;
		var _events = {};
		var _eventClass = {};
		if (!!eventClass) for (let k in eventClass) {
			let ec = eventClass[k];
			if (ec.isSubClassOf(EventData)) _eventClass[k] = ec;
		}
		Object.defineProperty(this, '_events', { configurable: false, value: _events });
		Object.defineProperty(this, '_eventClass', { configurable: false, value: _eventClass });
		Object.defineProperty(this, 'silence', { configurable: false, enumerable: true, get: () => silence });

		if (!!host) {
			Object.defineProperty(this, 'host', { configurable: false, value: host });
			if (!host.heart) Object.defineProperty(host, 'heart', { configurable: false, value: self });
			host.on = host.on || ((...args) => { self.on.apply(self, args); return host; });
			host.once = host.once || ((...args) => { self.once.apply(self, args); return host; });
			host.off = host.off || ((...args) => { self.off.apply(self, args); return host; });
			host.clear = host.clear || ((...args)  =>{ self.clear.apply(self, args); return host; });
			host.emit = host.emit || ((...args) => { self.emit.apply(self, args); return host; });
			if (!host.events) Object.defineProperty(host, 'events', { value: self.events });
		}

		if (!silence) (events || []).map(e => {
			createHooker(this, e);
			createEmitter(this, e);
		});
	}
	get events () {
		return Object.keys(this._events);
	}
	on (eventName, callback) {
		this._events[eventName] = this._events[eventName] || [];
		this._events[eventName].push([callback, false]);
		if (!this.silence) createEmitter(this, eventName);
		return this;
	}
	once (eventName, callback) {
		this._events[eventName] = this._events[eventName] || [];
		this._events[eventName].push([callback, true]);
		createEmitter(this, eventName);
		return this;
	}
	off (eventName, callback) {
		var list = this._events[eventName];
		if (!list) return this;
		var index = -1;
		list.some((cbs, i) => {
			if (cbs[0] === callback) {
				index = i;
				return true;
			}
		});
		if (index < 0) return this;
		list.splice(index, 1);
		return this;
	}
	clear (eventName) {
		var list = this._events[eventName];
		if (!list) return this;
		list.splice(0, list.length);
		return this;
	}
	emit (eventName, ...args) {
		var pipe = this._events[eventName];
		if (!pipe) return this;
		if (pipe.length === 0) return this;
		var ec = this._eventClass[eventName] || this._eventClass.default || EventManager.EventData;
		let event = args[args.length - 1];
		if (!(event instanceof EventData)) {
			event = new ec(eventName, this.host || this);
		}
		else {
			event = args.pop();
		}
		args.push(event);
		var copy = pipe.copy();
		return new Promise(async (res, rej) => {
			var onces = [];
			for (let cbs of copy) {
				event.emitTime = new Date();
				let finish = !!(await cbs[0].call(this.host || this, ...args));
				if (cbs[1]) onces.unshift(cbs);
				if (finish) break;
			}
			onces.forEach(cbs => {
				var index = pipe.indexOf(cbs);
				pipe.splice(index, 1);
			});
			res();
		});
	}
}

EventManager.EventData = EventData;
EventManager.AsyncEventManager = AsyncEventManager;

module.exports = EventManager;
_('Utils.Events.EventManager', EventManager);
_('Utils.Events.AsyncEventManager', AsyncEventManager);