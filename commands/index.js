const { readdir, writeFile, readFile } = require('node:fs/promises');
const { join } = require('node:path');
const ExtraAlias = {};

const DefaultScope = ['main', 'sub'];
const Commands = {
	list: {},
	alias: {},
};
const commands = {};

Commands.loadCommands = async () => {
	var list, extra;
	try {
		list = await readdir(__dirname);
	}
	catch {
		list = [];
	}
	try {
		extra = await readFile(join(process.cwd(), 'out', 'dynamicalias.txt'), 'utf-8');
		extra = JSON.parse(extra);
	}
	catch {
		extra = {};
	}
	Commands.alias = Object.assign({}, Commands.alias, extra);
	list.forEach(filename => {
		if (!filename) return;
		if (!!filename.match(/^index\.js$/i)) return;
		var cmd = require('./' + filename);
		if (!cmd || !cmd.cmd || !cmd.name) return;
		Commands.list[cmd.cmd] = {
			name: cmd.name,
			command: cmd.cmd,
			alias: cmd.alias,
			args: cmd.args || {},
			scope: !!cmd.scope ? cmd.scope : DefaultScope
		};
		if (!!cmd.alias && !!cmd.alias.forEach) cmd.alias.forEach(n => {
			Commands.alias[n] = cmd.cmd;
		});
		commands[cmd.cmd] = cmd.execute;
	});
};
Commands.generateCommands = (scope="main") => {
	var list = [], i = 1;
	for (let cmd in Commands.list) {
		cmd = Commands.list[cmd];
		if (!cmd.scope.includes(scope)) continue;
		let command = i + '. ' + cmd.name + '\n    "' + cmd.command + '": ';
		let args = [];
		for (let arg in cmd.args) {
			let hint = cmd.args[arg];
			args.push('"' + arg + '": "<' + hint + '>"');
		}
		if (args.length === 0) {
			command += 'no arg.';
		}
		else {
			command += 'args: ' + args.join(', ');
		}
		list.push(command);
		i ++;
	}
	return list.join('\n');
};
Commands.executeCommands = async (type, scope, caller, cmd, args) => {
	var command = commands[cmd];
	if (!command) {
		throw new Error('Nonexist command.');
	}
	var scopeList = Commands.list[cmd].scope;
	if (!scopeList.includes(scope)) {
		throw new Error('Out of scope: ' + scope);
	}
	return await command(type, caller, args);
};
Commands.normalizeCommandName = name => {
	var action = name.replace(/[ \t\-\.]/g, '_').toLowerCase();
	return action;
};
Commands.getCommandName = name => {
	var cmd = Commands.list[name];
	if (!cmd) {
		let alias = Commands.alias[name];
		cmd = Commands.list[alias];
	}
	return cmd;
};
Commands.addAlias = (alias, cmd) => {
	Commands.alias[alias] = cmd;
	ExtraAlias[alias] = cmd;
	writeFile(join(process.cwd(), 'out', 'dynamicalias.txt'), JSON.stringify(ExtraAlias), 'utf-8');
};

module.exports = Commands;