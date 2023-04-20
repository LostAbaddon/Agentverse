/**
 * Name:	Finite State Machine
 * Desc:    有限自动机
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2017.11.09
 */

const EM = require('./eventManager');

class FSMEvent extends EM.EventData {
	constructor (eventName, stateFrom, stateTo, target) {
		super(eventName, target);
		this.stateFrom = stateFrom;
		this.stateTo = stateTo;
	}
}

class FiniteStateMachine extends EM.AsyncEventManager {
	constructor (transactions) {
		super(null, ['leaveState', 'enterState', 'transact', 'request'], { default: FSMEvent });
		if (String.is(transactions)) {
			transactions = transactions.split(/[\n\r;,]/gi)
		}
		else if (!(transactions instanceof Array)) {
			transactions = [];
		}
		var transactionMap = [];
		Object.defineProperty(this, 'transactionMap', {
			configurable: true,
			enumerable: false,
			get: () => transactionMap
		});
		var states = [];
		Object.defineProperty(this, 'states', {
			configurable: true,
			enumerable: false,
			get: () => states
		});
		var initialed = false;
		Object.defineProperty(this, 'initialed', {
			configurable: false,
			enumerable: false,
			get: () => initialed,
			set: ini => initialed = ini
		});
		transactions.forEach(trans => this.setTransaction(trans));
	}
	setTransaction (...args) {
		var stateFrom, stateTo, stateChecker = () => true;
		if (args.length === 0) return this;
		else if (args.length === 1) {
			args = args[0].split('->');
			if (args.length < 2) return this;
			stateFrom = args[0];
			stateTo = args[1];
		}
		else if (args.length === 2) {
			if (args[1] instanceof Function) {
				stateChecker = args[1];
				args = args[0].split('->');
				if (args.length < 2) return this;
				stateFrom = args[0];
				stateTo = args[1];
			}
			else {
				stateFrom = args[0];
				stateTo = args[1];
			}
		}
		else {
			stateFrom = args[0];
			stateTo = args[1];
			if (args[2] instanceof Function) stateChecker = args[2];
		}
		if (this.states.indexOf(stateFrom) < 0) this.states.push(stateFrom);
		if (this.states.indexOf(stateTo) < 0) this.states.push(stateTo);
		this.transactionMap[stateFrom] = this.transactionMap[stateFrom] || [];
		this.transactionMap[stateFrom][stateTo] = stateChecker;
	}
	init (initState) {
		if (this.initialed) return;

		var states = {};
		Symbol.setSymbols(states, this.states);
		Object.defineProperty(this, 'states', {
			configurable: false,
			enumerable: true,
			get: () => states
		});

		var map = {};
		for (let sFrom in this.transactionMap) {
			let nFrom = this.states[sFrom];
			var nm = {};
			var m = this.transactionMap[sFrom];
			for (let sTo in m) {
				let nTo = this.states[sTo];
				nm[nTo] = m[sTo];
			}
			map[nFrom] = nm;
		}
		Object.defineProperty(this, 'transactionMap', {
			configurable: false,
			enumerable: false,
			get: () => map
		});

		var hasInit = true;
		if (!initState) {
			hasInit = false;
		}
		else if (String.is(initState)) {
			this.current = this.states[initState];
			if (!this.current) hasInit = false;
		}
		else if (Symbol.is(initState)) {
			this.current = null;
			for (let s in this.states) {
				if (this.states[s] === initState) {
					this.current = initState;
					break;
				}
			}
			hasInit = !!this.current;
		}
		else {
			hasInit = false;
		}
		if (!hasInit) {
			if (!this.states.INIT) {
				this.states.INIT = Symbol('INITIAL');
			}
			this.current = this.states.INIT;
		}
		this.target = null;
		this.transacting = false;
		this.initialed = true;
	}
	async transact (state) {
		if (String.is(state)) {
			state = this.states[state];
			if (!state) return this;
		}
		else if (!Symbol.is(state)) return this;
		var can_transact;
		var rule = this.transactionMap[this.current];
		if (!rule) {
			rule = false;
		}
		else {
			rule = rule[state];
			if (!rule) rule = false;
		}
		if (rule === false) can_transact = false;
		if (rule === true) can_transact = true;
		else if (rule instanceof Function) can_transact = rule(this.current, state, this);
		else can_transact = false;
		var event = new FSMEvent('transactionRequest', this.current, state, this);
		event.can_transact = can_transact;
		await this.emit('request', event);
		can_transact = event.can_transact;
		if (!can_transact) return this;

		var currName = this.states.toString(this.current), targetName = this.states.toString(state);
		event = new FSMEvent('leaveState', this.current, state, this);
		this.target = state;
		await this.emit('leave' + currName, event);
		await this.emit('leaveState', event);
		this.transacting = true;
		event = new FSMEvent('transactState', this.current, state, this);
		await this.emit('transact' + currName + 'To' + targetName, event);
		await this.emit('transact', event);
		this.transacting = false;
		event = new FSMEvent('enterState', this.current, state, this);
		this.current = state;
		this.target = null;
		await this.emit('enter' + targetName, event);
		await this.emit('enterState', event);
		
		return this;
	}
}
FiniteStateMachine.Event = FSMEvent;

module.exports = FiniteStateMachine;
_('Events.FiniteStateMachine', FiniteStateMachine);