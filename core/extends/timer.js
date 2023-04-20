/**
 * Name:	Timer Utils
 * Desc:    Timer 类拓展工具
 * Author:	LostAbaddon
 * Version:	0.0.3
 * Date:	2018.11.02
 */

if (!!global.setTimeout) { // For Process instead of Thread
	global.setImmediate = global.setImmediate || function (callback) { setTimeout(callback, 0); };
	global.nextTick = !!process ? process.nextTick || global.setImmediate : global.setImmediate;
	global.wait = promisify((delay, next) => {
		var start = new Date().getTime();
		if (Function.is(delay)) {
			next = delay;
			delay = 0;
		}
		setTimeout(() => next(new Date().getTime() - start), delay);
	});
	global.waitLoop = promisify(next => {
		var start = new Date().getTime();
		setImmediate(() => next(new Date().getTime() - start));
	});
	global.waitTick = promisify(next => {
		var start = new Date().getTime();
		nextTick(() => next(new Date().getTime() - start));
	});
	if (!!global.queueMicrotask) global.waitQueue = promisify(next => {
		var start = new Date().getTime();
		queueMicrotask(() => next(new Date().getTime() - start));
	});
}

if (global._env === "node") {
	global.now = () => {
		var t = process.hrtime();
		return t[0] * 1000 + t[1] / 1000000;
	}
} else {
	global.now = () => Date.now();
}

global.Clock = class Clock {
	constructor (lable='Initialized', not_node=false) {
		this.stamps = [];
		this.isNode = !!global.process;
		if (this.isNode && !not_node) {
			this.clock = () => {
				var c = process.hrtime();
				return c[0] + c[1] / 1e9;
			};
		}
		else {
			this.clock = () => new Date().getTime() / 1000;
		}
		this.stamp(lable);
	}
	stamp (lable='') {
		var stamp = this.clock();
		this.stamps.push([stamp, lable]);
		return stamp;
	}
	list (is_text=true) {
		var last = this.stamps[0][0], len = this.stamps.length, list, max = 0;
		list = this.stamps.map(s => {
			var r = [s[0] - last, s[1]];
			last = s[0];
			var l = s[1].length;
			if (l > max) max = l;
			return r;
		});
		if (!is_text) return list;
		list = list.map(l => {
			var lab = l[1], nan = l[0];
			lab = lab.padStart(max, ' ');
			return lab + '\t' + nan;
		});
		return list.join('\n');
	}
	getStamp (lable) {
		if (!lable) return -1;
		var result = -1;
		this.stamps.some(s => {
			if (s[1] === lable) {
				result = s[0];
				return true;
			}
			return false;
		});
		return result;
	}
	spent (start, end) {
		if (!end) {
			end = this.getStamp(start);
			if (end < 0) end = this.stamps[this.stamps.length - 1][0];
			start = this.stamps[0][0];
		}
		else {
			start = this.getStamp(start);
			if (start < 0) start = this.stamps[0][0];
			end = this.getStamp(end);
			if (end < 0) end = this.stamps[this.stamps.length - 1][0];
		}
		return end - start;
	}
};