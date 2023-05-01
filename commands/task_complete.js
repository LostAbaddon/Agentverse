const command = {
	"name": "Task Complete",
	"cmd": "task_complete",
	"alias": ["shutdown", "mission_complete"],
	"args": {
		"reason": "reason"
	}
};

command.execute = (type, caller, reason) => {
	if (!reason || !reason.reason) reason = "Job Done.";
	else reason = reason.reason;
	return {
		speak: reason,
		reply: null,
		exit: true
	};
};

module.exports = command;