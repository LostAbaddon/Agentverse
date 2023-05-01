const { readdir } = require('node:fs/promises');

const Commands = {
	list: [],
	alias: {}
};
const commands = {};

Commands.loadCommands = async () => {
	var list = await readdir(__dirname);
	list.forEach(filename => {
		if (!filename) return;
		if (!!filename.match(/^index\.js$/i)) return;
		var cmd = require('./' + filename);
		Commands.list.push({
			name: cmd.name,
			command: cmd.cmd,
			alias: cmd.alias,
			args: cmd.args || {}
		});
		if (!!cmd.alias && !!cmd.alias.forEach) cmd.alias.forEach(n => {
			Commands.alias[n] = cmd.cmd;
		});
		commands[cmd.cmd] = cmd.execute;
	});
};
Commands.generateCommands = () => {
	var list = Commands.list.map((cmd, i) => {
		var command = i + 1 + '. ' + cmd.name + ': "' + cmd.command + '", args: ';
		var args = [];
		for (let arg in cmd.args) {
			let hint = cmd.args[arg];
			args.push('"' + arg + '": "<' + hint + '>"');
		}
		command += args.join(', ');
		return command;
	});
	return list.join('\n');
};
Commands.executeCommands = async (type, caller, cmd, args) => {
	var command = commands[cmd];
	if (!command) {
		throw new Error('Nonexist command.');
	}
	return await command(type, caller, args);
};

module.exports = Commands;