const command = {
	"name": "Do Nothing",
	"cmd": "do_nothing"
};

command.execute = (type, caller, reason) => {
	return {
		speak: "Nothing to do.",
		noReply: true
	};
};

module.exports = command;