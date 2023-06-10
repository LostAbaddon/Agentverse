const Commands = require('../commands');
const config = require('../config.json');

const command = {
	"name": "Think deeply",
	"cmd": "think",
	"alias": ['thought', 'conceive', 'envisage', 'envision', 'imagine', 'conside', 'contemplate', 'deliberate', 'ask_self', 'askself'],
	"args": {
		"problem": "problem",
	}
};
const DefaultPrompt = "Your task is to provide a step-by-step solution to the given task. Please identify the task and provide a clear and concise breakdown of the steps needed to solve it. Your solution strategy should be well-defined and easy to follow, providing a clear path to the solution of the problem. Finally, please provide a complete solution to the problem, demonstrating your understanding of the necessary steps and how they lead to the solution.\n\nPlease note that your response should be flexible enough to allow for various relevant and creative approaches to solving the problem, while maintaining a clear structure and focus on accuracy.\n\nTask:\n";

command.execute = async (type, caller, target) => {
	var retryMax = config.setting?.retry || 1;
	if (!(retryMax > 1)) retryMax = 1;

	var problem, prepare = "Think something interesting.";
	for (let key in target) {
		let value = target[key];
		prepare = value;
		if (!!key.match(/\b(task|mission|job|work|action)s?\b/i)) {
			problem = value;
		}
	}
	if (!problem) problem = prepare;

	var prompt = DefaultPrompt + problem;
	var ai = caller.copy();

	var result;
	for (let i = retryMax; i > 0; i --) {
		try {
			result = await ai.send(prompt, 1.0, false);
			return {
				speak: `Deeply thought got result:\n${result}`,
				reply: result,
				exit: false
			};
		}
		catch (err) {
			let msg = err.message || err.msg || err;
			console.error(`Deeply thougnt error: ${msg}`)
			if (i > 1) {
				await wait(1000);
				console.error(`Deeply thougnt retry...`);
				continue;
			}
			return {
				speak: `Deeply thougnt error: ${msg}`,
				reply: "failed",
				exit: false
			};
		}
	}
};

module.exports = command;