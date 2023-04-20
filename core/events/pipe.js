/**
 * Name:	Aync Pipe Manager
 * Desc:    异步事件管道以及同步垒，同步垒支持优先级
 * Author:	LostAbaddon
 * Version:	0.0.3
 * Date:	2017.11.16
 */

const EM = require('./eventManager');

class PipeEvent extends EM.EventData {
	constructor (pipe) {
		super('pipeEvent', pipe);
		this.index = 0;
		this.total = pipe.length;
	}
	update () {
		this.total = this.target.length;
		this.timestamp = new Date();
	}
}
class Pipe {
	constructor (reverse = false, auto = false) {
		new EM(this, [
			'start',
			'step',
			'done'
		]);
		var pipe = [];
		Object.defineProperty(this, 'pipe', {
			configurable: false,
			enumerable: false,
			get: () => pipe
		});
		Object.defineProperty(this, 'reverse', {
			configurable: false,
			enumerable: false,
			get: () => reverse
		});
		Object.defineProperty(this, 'auto', {
			configurable: false,
			enumerable: false,
			get: () => auto
		});
		var running = false;
		Object.defineProperty(this, 'running', {
			enumerable: false,
			get: () => running,
			set: value => running = value
		});
		var reses = [];
		Object.defineProperty(this, 'reses', {
			configurable: false,
			enumerable: false,
			get: () => reses
		});
	}
	add (task, ...args) {
		if (!(task instanceof Function)) return this;
		this.pipe.push([task, args]);
		if (this.auto) this.launch();
		return this;
	}
	launch () {
		return new Promise(async (res, rej) => {
			this.reses.push(res);
			if (this.running) return;
			this.running = true;
			var event = new PipeEvent(this);
			this.onStart(event);
			while (this.pipe.length > 0) {
				let task;
				if (this.reverse) task = this.pipe.pop();
				else task = this.pipe.shift();
				let args = task[1];
				task = task[0];
				event.update();
				args.push(event);
				await task(...args);
				this.onStep(event);
			}
			this.onDone(event);
			this.running = false;
			this.reses.forEach(res => res());
		});
	}
	get length () {
		return this.pipe.length;
	}
	copy () {
		var duplicate = new Pipe(this.reverse);
		this.pipe.forEach(task => duplicate.add(task[0], ...task[1]));
		return duplicate;
	}
}

class BarrierKey {
	constructor (barrier, priority) {
		if (!(barrier instanceof Barrier)) return;
		this.barrier = barrier;
		var key = Symbol();
		Object.defineProperty(this, 'key', {
			configurable: false,
			enumerable: true,
			get: () => key
		});
		Object.defineProperty(this, 'priority', {
			configurable: false,
			enumerable: true,
			get: () => priority
		});
	}
	solve () {
		return new Promise(async (res, rej) => {
			await this.barrier.solve(this);
			res();
		});
	}
}
class Barrier {
	constructor () {
		new EM(this, [
			'active',
			'step',
			'done'
		]);
		var barrier = [];
		Object.defineProperty(this, 'barrier', {
			configurable: false,
			enumerable: false,
			get: () => barrier
		});
		var worker = [];
		Object.defineProperty(this, 'worker', {
			configurable: false,
			enumerable: false,
			get: () => worker
		});
	}
	request (priority) {
		var key = new BarrierKey(this, priority || 0);
		this.barrier.push(key.key);
		return key;
	}
	active () {
		if (this.worker.length > 0) return this;
		this.barrier.forEach(b => this.worker.push(b));
		this.worker.waiters = [];
		this.onActive(this);
		return this;
	}
	solve (key) {
		return new Promise((res, rej) => {
			if (!(key instanceof BarrierKey)) {
				res();
				return;
			}
			var index = this.worker.indexOf(key.key);
			if (index < 0) {
				res();
				return;
			}
			this.worker.splice(index, 1);
			this.worker.waiters.push([res, key.priority]);
			this.onStep(this);
			if (this.worker.length === 0) {
				this.worker.waiters.sort((ka, kb) => kb[1] - ka[1]);
				this.worker.waiters.forEach(res => res[0]());
				this.worker.waiters.splice(0, this.worker.waiters.length);
				this.onDone(this);
			}
		});
	}
	get length () {
		return this.barrier.length;
	}
	get waiting () {
		return this.worker.length;
	}
	copy () {
		var duplicate = new Barrier();
		this.barrier.forEach(b => duplicate.barrier.push(b));
		return duplicate;
	}
}

exports.Pipe = Pipe;
exports.Barrier = Barrier;
_('Events.Pipe', Pipe);
_('Events.Barrier', Barrier);