const Commands = require('../commands');
const config = require('../config.json');

const command = {
	"name": "Create Agent",
	"cmd": "create_agent",
	"alias": ['new_agent', 'sub_agent', 'new_ai', 'newagent', 'subagent', 'newai'],
	"args": {
		"role": "role",
		"task": "task",
		"useCommands": "useCommands"
	},
	"scope": ['main']
};

command.execute = async (type, caller, target) => {
	var retryMax = config.setting?.retry || 1;
	if (!(retryMax > 1)) retryMax = 1;

	var action = {}, prepare = {
		task: "Think something interesting.",
		useCommands: false
	};
	for (let key in target) {
		let value = target[key];
		let low = (value + '').toLowerCase();
		if (!!low.match(/true|false|yes|no|use|not?[ _]*use/i)) {
			prepare.useCommands = !low.match(/false|no|not?[ _]*use/i);
		}
		else {
			prepare.task = value;
		}
		if (!!key.match(/\b(task|mission|job|work|action)s?\b/i)) {
			action.task = value;
		}
		else if (!!key.match(/\b(use|commands?|usecommands?)\b/i)) {
			action.useCommands = !low.match(/false|no|not?[ _]*use/i);
		}
		else {
			action.role = value;
		}
	}
	action = Object.assign({}, prepare, action);
	action.useCommands = false; // test

	var prompt = [], idx = caller.agents.length + 1;
	prompt.push(`Your name is agent-${idx}.`);
	if (!!action.role) {
		prompt.push(`From now on, you are ${action.role}.`);
	}
	prompt.push(action.task);
	if (action.useCommands) {
		let p = 'Commands you can use:\n' + Commands.generateCommands('sub');
		prompt.push(p);
	}
	prompt = prompt.join('\n\n');

	var ai = caller.copy();
	caller.agents.push(ai);

	var result;
	for (let i = retryMax; i > 0; i --) {
		try {
			result = await ai.send(prompt, 1.0, false);
			return {
				speak: `Sub Agent-${idx} finished the task with reply:\n${result}`,
				reply: `Sub Agent-${idx} finished the task, here's the reply, you can use them to continue you mission:\n${result}`,
				exit: false
			};
		}
		catch (err) {
			let msg = err.message || err.msg || err;
			console.error(`Sub Agent-${idx} error: ${msg}`)
			if (i > 1) {
				await wait(1000);
				console.error(`Sub Agent-${idx} retry...`);
				continue;
			}
			return {
				speak: `Sub Agent-${idx} error: ${msg}`,
				reply: "failed",
				exit: false
			};
		}
	}
};

module.exports = command;