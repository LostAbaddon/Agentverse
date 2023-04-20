/**
 * Name:	延时触发器
 * Desc:    等待指定时间来触发特定事件的触发器
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2019.06.20
 */

const symbLaunch = Symbol('launch'); // 伪私有方法名，只要它不暴露，外界就无法调用该名命名的方法
const LifeCycle = Symbol.setSymbols("IDLE", "WAITING", "FINISHED")

class DelayTrigger {
	#task = null;
	#delay = 0;
	#pump = 0;
	#trigger = null;
	#start = 0;
	#status = LifeCycle.IDLE;
	constructor (delay, pump, task) {
		if (Function.is(delay)) {
			this.#task = delay;
			this.#delay = 0;
			this.#pump = 0;
		} else if (Funcion.is(pump)) {
			this.#task = pump;
			if (!Number.is(delay) || delay < 0) delay = 0;
			this.#delay = delay;
			this.#pump = delay;
		} else if (!Function.is(task)) {
			return;
		} else {
			this.#task = task;
			if (!Number.is(delay) || delay < 0) delay = 0;
			this.#delay = delay;
			if (!Number.is(pump) || pump < 0) pump = 0;
			this.#pump = pump;
		}
		this.#start = now();

		this.#status = LifeCycle.WAITING;
		this[symbLaunch](this.#delay);
	}
	[symbLaunch] (delay) {
		if (!!this.#trigger) clearTimeout(this.#trigger);
		this.#trigger = setTimeout(() => {
			this.#trigger = null;
			var end = now();
			this.#status = LifeCycle.FINISHED;
			this.#task(end - this.#start);
		}, delay);
	}
	delay (delay) {
		if (this.#status !== LifeCycle.WAITING) return;
		if (Number.is(delay) && delay >= 0) this[symbLaunch](delay);
		else this[symbLaunch](this.#pump);
	}
	finish () {
		if (this.#status !== LifeCycle.WAITING) return;
		if (!!this.#trigger) {
			clearTimeout(this.#trigger);
			this.#trigger = null;
		}
		var end = now();
		this.#status = LifeCycle.FINISHED;
		this.#task(end - this.#start);
	}
}

exports.DelayTrigger = DelayTrigger;
_('Events.DelayTrigger', DelayTrigger);