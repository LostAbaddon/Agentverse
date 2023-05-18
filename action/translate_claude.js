const browse = require('../commands/browse');

const Action = {
	name: "translate",
};

Action.execute = async (option, ai) => {
	ai = ai.copy();

	var language = option.language || option.lang || option.lan || option.l || '中文';
	var target = option.target;
	if (!target) {
		target = 'Empty content.';
	}
	else if (browse.isURL(target)) {
	}

	return 'FUCK!';
};

module.exports = Action;