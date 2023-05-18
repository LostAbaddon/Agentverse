const { EventEmitter } = require('node:events');
require('../kernel/log.js');
const setStyle = _('CL.SetStyle');
const Logger = _("Utils.Logger");
const logger = new Logger('AICenter');
const Agents = require("./agents.js");

const Runtime = {
	current: null,
	config: null,
	pool: {},
};

const hooks = new EventEmitter();

const events = [
	"ask",
	"task",
	"action"
];

const newID = (len=16) => {
	var id = [];
	for (let i = 0; i < len; i ++) {
		id.push(Math.floor(Math.random() * 36).toString(36))
	}
	return id.join('');
};

const callFunction = async (event, data) => {
	var agent;
	if (!Runtime.chat || !Runtime.pool[Runtime.chat] || !!data.new) {
		agent = newAgent();
		if (!!data.knowledge) {
			await agent.loadKnowledge(data.knowledge);
		}
		Runtime.chat = agent.id;
	}
	else {
		agent = Runtime.pool[Runtime.chat];
	}

	if (!agent[event]) {
		let errMsg = "No handler for event " + event;
		if (global.isSingleton) console.error(errMsg);
		else logger.error(errMsg);
		return [undefined, new Error(errMsg)];
	}

	var result, err;
	try {
		result = await agent[event](data);
	}
	catch (e) {
		console.error(e);
		err = e;
		result = null;
	}
	return [result, err];
};
const showResult = (type, event, data, err) => {
	if (type === 'reply') {
		if (!!err) {
			console.log(setStyle("AI get wrong: ", "bold red") + (err.message || err.msg || err));
		}
		else {
			console.log(setStyle("AI reply: ", "bold green") + data);
		}
	}
	else if (type === 'send') {
		console.log(setStyle("You said: ", "bold green") + data);
	}
	else if (type === 'waiting') {
		console.log(setStyle("Thinking...", "magenta"));
	}
	else if (type === 'leaving') {
		console.log(setStyle("Mission Completed.", "red"));
	}
};

const init = async cfg => {
	Runtime.current = Agents.Agents[cfg.type];
	Runtime.config = cfg.config;
	await Agents.initAI();
};

const newAgent = () => {
	var agent = new Runtime.current(newID(), Runtime.config);
	Runtime.pool[agent.id] = agent;
	hooks.emit('agent:new', agent, Runtime);
	return agent;
};
const removeAgent = (aid) => {
	var agent = Runtime.pool[aid];
	if (!!agent) {
		console.log('Delete Agent', agent);
		delete Runtime.pool[aid];
		return true;
	}
	else {
		return false;
	}
};

const onNewAgent = (cb) => {
	hooks.on('agent:new', cb);
};
const onAgentChanged = (cb) => {
	hooks.on('agent:remoed', cb);
};

module.exports = {
	init,
	events,
	call: callFunction,
	show: showResult,

	newAgent,

	onNewAgent,
};