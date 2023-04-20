/**
 * Name:	Commander Line Interface
 * Desc:    命令行交互
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2017.10.14
 */

const RegRawStyle = /[\u001b].*?m/g;

const fs = require('fs');
const ReadLine = require('readline');

const setStyle = require('./setConsoleStyle');
const DefaultHistorySize = 30;
const DefaultHints = {
	hint: '> ',
	answer: '_ ',
	error: ': ',
	errorStyle: 'magenta',
	optionStyle: 'green bold',
	probarTitleStyle: 'yellow bold',
	probarBGStyle: 'bgCyan',
	probarFGStyle: 'bgGreen',
	welcome: 'Welcome!',
	byebye: 'Byebye...'
};
const CommandHistory = {
	records: [],
	trigger: null,
	delay: 1000 * 60 * 10,
	room: 10,
	limit: 1000,
	storage: '/commands.history',
	push: (command) => {
		command = command.trim();
		if (CommandHistory.records[CommandHistory.records.length - 1] === command) return;
		CommandHistory.records.push(command);
		if (!!CommandHistory.trigger) clearTimeout(CommandHistory.trigger);
		if (CommandHistory.records.length >= CommandHistory.room) {
			CommandHistory.save();
		}
		else {
			CommandHistory.trigger = setTimeout(CommandHistory.save, CommandHistory.delay);
		}
	},
	save: () => new Promise((res, rej) => {
		var rec = CommandHistory.records.copy();
		if (rec.length === 0) {
			res();
			return;
		}
		fs.appendFile(process.env.PWD + CommandHistory.storage, rec.join('\n') + '\n', { encoding: 'utf8' }, async err => {
			if (!err) {
				CommandHistory.records.splice(0, rec.length);
			}
			setImmediate(res);
		});
	}),
	load: (cli) => new Promise((res, rej) => {
		fs.readFile(process.env.PWD + CommandHistory.storage, (err, data) => {
			if (!!err) return;
			var commands = data.toString();
			commands = commands.replace(/^[ \n\r\t]*|[ \n\r\t]*$/g, '');
			commands = commands.split('\n').map(c => c.trim());
			if (commands.length > CommandHistory.limit) {
				commands.splice(0, commands.length - CommandHistory.limit);
			}
			var last = '', list = [];
			commands.forEach(c => {
				if (c === last) return;
				last = c;
				list.push(c);
				cli.history.unshift(c);
			});
			list = list.join('\n') + '\n';
			fs.writeFile(process.env.PWD + CommandHistory.storage, list, { encoding: 'utf8' }, err => {
				console.error(err);
				res();
			});
		});
	})
};

class CLI {
	constructor (historySize, hints) {
		this.historySize = historySize || DefaultHistorySize;
		if (isNaN(this.historySize) || this.historySize < 0) this.historySize = DefaultHistorySize;

		this.requestCallback = null;
		this.quitCallback = null;
		this.exitCallback = null;

		hints = hints || {};
		this.hints = {};
		this.hints.hint = hints.hint || DefaultHints.hint;
		this.hints.answer = hints.answer || DefaultHints.answer;
		this.hints.error = hints.error || DefaultHints.error;
		this.hints.errorStyle = hints.errorStyle || DefaultHints.errorStyle;
		this.hints.optionStyle = hints.optionStyle || DefaultHints.optionStyle;
		this.hints.probarTitleStyle = hints.probarTitleStyle || DefaultHints.probarTitleStyle;
		this.hints.probarBGStyle = hints.probarBGStyle || DefaultHints.probarBGStyle;
		this.hints.probarFGStyle = hints.probarFGStyle || DefaultHints.probarFGStyle;
		this.hints.welcome = hints.welcome || DefaultHints.welcome;
		this.hints.byebye = hints.byebye || DefaultHints.byebye;

		this.waiting = false;
		this.shouldStopWaiting = false;
		this.waitingKey = null;
		this.waitingPrompt = '';
		this.waitingPool = [];
		this.waitingOptions = [];
		this.processLength = 0;
		this.processPercent = [];
		this.waitingInput = false;
		this.shouldClearLine = false;

		ReadLine.emitKeypressEvents(process.stdin);
		if (!!process.stdin.setEncoding) process.stdin.setEncoding('utf8');
		if (!!process.stdin.setRawMode) process.stdin.setRawMode(true);
		process.stdin.on('keypress', async (chunk, key) => {
			if (key && key.ctrl && key.name == 'c') {
				this.waiting = false;
				await this.close();
				setImmediate(() => {
					if (this.exitCallback) this.exitCallback();
				});
			}
			if (!this.waiting) {
				if (key && key.ctrl && key.name == 'd') {
					this.shouldClearLine = true;
					setImmediate(() => {
						this.rl.write('\r');
					});
				}
				return;
			}
			if (key.name !== 'return') this.waitingInput = true;
			var optionIndex = this.waitingOptions.indexOf(key.name);
			if (key.name !== this.waitingKey && optionIndex < 0) {
				this.clear();
				this.cursor(-9999, 0);
				let last_inputted = this.waitingInput;
				setImmediate(() => {
					this.clear();
					this.cursor(-9999, 0);
					if (!this.waiting) return;
					if (this.waitingKey !== 'return' && key.name === 'return') {
						if (last_inputted) {
							this.cursor(-9999, -1);
							console.log(this.waitingPrompt);
							this.cursor(-9999, -1);
							rl.history.shift();
							this.waitingInput = false;
						}
						else {
							console.log(this.waitingPrompt);
							this.cursor(-9999, -1);
						}
					}
					else {
						console.log(this.waitingPrompt);
						this.cursor(-9999, -1);
					}
				});
				return;
			}
			if (this.waitingKey === 'return') {
				this.shouldStopWaiting = true;
				this.answer(this.waitingPrompt);
				this.hint();
				let last_inputted = this.waitingInput;
				if (key.name === 'return') setImmediate(() => {
					if (last_inputted) rl.history.shift();
				});
			}
			else {
				if (key.name === this.waitingKey || optionIndex >= 0) {
					setImmediate(() => {
						this.cursor(-9999, 0);
						this.clear();
						console.log(setStyle(this.waitingPrompt.replace(RegRawStyle, ''), 'yellow bold'));
						this.waiting = false;
						this.shouldStopWaiting = false;
						this.hint();
						this.clear(1);
						var reses = this.waitingPool.map(pair => pair[0]);
						this.waitingPool.splice(0, this.waitingPool.length);
						if (this.waitingOptions.length < 0) optionIndex = '';
						reses.map(res => res(optionIndex));
					});
				}
				else {
					this.shouldStopWaiting = true;
					this.answer(this.waitingPrompt);
					this.hint();
				}
			}
		});

		var rl = ReadLine.createInterface({
			input: process.stdin,
			output: process.stdout,
			terminal: true,
			historySize: this.historySize,
			removeHistoryDuplicates: true
		});
		this.rl = rl;

		rl.on('line', line => {
			if (this.shouldClearLine) {
				this.shouldClearLine = false;
				if (line.length > 0) {
					this.rl.write('\r');
				}
				this.cursor(0, -1);
				this.hint();
				return;
			}
			if (this.shouldStopWaiting && this.waiting) {
				this.waitingInput = false;
				this.waiting = false;
				this.shouldStopWaiting = false;
				setImmediate(() => {
					this.cursor(-9999, 0);
					this.clear();
					this.cursor(0, -1);
					this.clear();
					this.cursor(0, -1);
					this.clear();
					console.log(setStyle(this.waitingPrompt.replace(RegRawStyle, ''), 'yellow bold'));
					this.hint();
					var reses = this.waitingPool.map(pair => pair[0]);
					this.waitingPool.splice(0, this.waitingPool.length);
					reses.map(res => res());
				});
				return;
			}
			line = line.trim();
			if (line.length > 0) {
				let result;
				if (!!this.requestCallback) {
					result = this.requestCallback(line, this);
					if (!!result && result.msg && result.msg.length > 0 && !result.nohint) this.answer(result.msg);
				}
				if (!result || !result.nohint) this.hint();
				if (!!result && result.norecord) {
					rl.history.shift();
				}
				else {
					CommandHistory.push(line);
				}
			}
			else {
				this.clear();
				this.cursor(-9999, -1);
				var prompt = rl._prompt.replace(RegRawStyle, '');
				this.cursor(prompt.length, 0);
			}
		});

		this.hint();
		this.answer(this.hints.welcome);

		CommandHistory.load(rl);
	}
	hint (hint) {
		hint = hint || this.hints.hint;
		this.rl.setPrompt(hint);
		this.rl.prompt();
		return this;
	}
	nohint () {
		this.rl.setPrompt('');
		this.rl.prompt();
		return this;
	}
	answer (text) {
		text = text || '';
		this.hint(this.hints.answer);
		console.log(text);
		this.hint();
		return this;
	}
	error (text) {
		text = text || '';
		this.hint(this.hints.error);
		console.log(setStyle(text, this.hints.errorStyle));
		this.hint();
		return this;
	}
	clear (dir) {
		// ReadLine.clearLine(process.stdin, dir || 0);
		if (process.stdin.isTTY) try {
			ReadLine.clearLine(process.stdin, dir || 0);
		}
		catch (err) {
			console.log(setStyle("console doesn't support clear...", "red bold"));
		}
		return this;
	}
	cursor (dx, dy) {
		// ReadLine.moveCursor(process.stdin, dx, dy);
		if (process.stdin.isTTY) try {
			ReadLine.moveCursor(process.stdin, dx, dy);
		}
		catch (err) {
			console.log(setStyle("console doesn't support cursor...", "red bold"));
		}
		return this;
	}
	stopInput () {
		this.isInputStopped = true;
		process.stdin.pause();
		return this;
	}
	resumeInput () {
		process.stdin.resume();
		this.isInputStopped = false;
		this.shouldClearLine = true;
		setImmediate(() => {
			this.rl.write('\r');
		});
		return this;
	}
	waitEnter (prompt, key) {
		return new Promise((res, rej) => {
			this.waiting = true;
			this.shouldStopWaiting = false;
			this.waitingKey = key || 'return';
			this.waitingOptions = [];
			this.waitingPrompt = this.hints.answer + (prompt || (this.waitingKey === 'return' ? '请按回车键......' : '请按' + this.waitingKey + '键......'));
			this.waitingPool.push([res, rej]);
			this.clear();
			this.cursor(-9999, 0);
			console.log(this.waitingPrompt);
			this.cursor(-9999, -1);
		});
	}
	waitOption (message, options) {
		return new Promise((res, rej) => {
			this.answer(message);
			this.waiting = true;
			this.shouldStopWaiting = false;
			this.waitingKey = 'nothing';
			this.waitingOptions = options.map((opt, i) => {
				var key;
				if (i < 9) key = (i + 1) + '';
				else key = String.fromCharCode(56 + i);
				this.answer('  ' + setStyle(key, this.hints.optionStyle) + String.blank(4 - key.length) + '-   ' + opt);
				return key.toLowerCase();
			});
			this.waitingPrompt = this.hints.answer + '请选择：';
			this.waitingPool.push([res, rej]);
			this.clear();
			this.cursor(-9999, 0);
			console.log(this.waitingPrompt);
			this.cursor(-9999, -1);
		});
	}
	waitProcessbar (hint, length, total) {
		return new Promise((res, rej) => {
			this.answer(setStyle(hint, this.hints.probarTitleStyle));
			this.answer(String.blank(length, '-'));
			this.processLength = length;
			for (let i = 0; i < total; i ++) {
				let j = (i + 1) + '';
				this.answer(String.blank(4 - j.length) + j + ' ' + setStyle(String.blank(length - 5), this.hints.probarBGStyle));
				this.processPercent[i] = 0;
			}
			this.answer(String.blank(length, '-'));
			this.waiting = true;
			this.shouldStopWaiting = false;
			this.waitingKey = 'nothing';
			this.waitingOptions = [];
			this.waitingPrompt = this.hints.answer + '更新中……';
			this.waitingPool.push([res, rej]);
			this.clear();
			this.cursor(-9999, 0);
			console.log(this.waitingPrompt);
			this.cursor(-9999, -1);
		});
	}
	updateProcessbar (index, percent) {
		var total = this.processPercent.length;
		if (index < 0 || index >= total) return;
		if (percent < 0) return;
		if (percent > 1) percent = 1;
		this.processPercent[index] = percent;
		var delta = total - index + 1;
		this.cursor(-9990, -delta);
		var j = (index + 1) + '';
		var p = Math.round((this.processLength - 5) * percent);
		var q = this.processLength - 5 - p;
		console.log(this.hints.answer + String.blank(4 - j.length) + j + ' ' + setStyle(String.blank(p), this.hints.probarFGStyle) + setStyle(String.blank(q), this.hints.probarBGStyle));
		this.cursor(-9990, delta - 1);
		var done = !this.processPercent.some(p => p < 1);
		if (done) {
			this.shouldStopWaiting = false;
			this.waiting = false;
			this.waitingInput = false;
			setImmediate(() => {
				this.cursor(-9999, 0);
				this.clear();
				this.answer(setStyle('进度已完成！', 'yellow bold'));
				this.waiting = false;
				this.shouldStopWaiting = false;
				this.waitingInput = false;
				this.hint();
				this.clear(1);
				var reses = this.waitingPool.map(pair => pair[0]);
				this.waitingPool.splice(0, this.waitingPool.length);
				reses.map(res => res(''));
			});
		}
	}
	close (silence) {
		return new Promise(async (res, rej) => {
			if (!!this.quitCallback) this.quitCallback(this);
			if (!silence) this.answer(this.hints.byebye);
			await CommandHistory.save();
			res();
			setImmediate(async () => {
				this.clear();
				this.cursor(-9999, 0);
				await this.rl.close();
				process.stdin.destroy();
			});
		});
	}
	onRequest (callback) {
		this.requestCallback = callback;
		return this;
	}
	onQuit (callback) {
		this.quitCallback = callback;
		return this;
	}
	onExit (callback) {
		this.exitCallback = callback;
		return this;
	}
}

const Intereface = config => {
	config = config || {};
	config.history = config.history || {};
	CommandHistory.delay = config.history.delay || CommandHistory.delay;
	CommandHistory.room = config.history.room || CommandHistory.room;
	CommandHistory.limit = config.history.limit || CommandHistory.limit;
	CommandHistory.storage = config.history.storage || CommandHistory.storage;
	var cli = new CLI(config.historySize, config.hints);
	return cli;
};
Intereface.CLI = CLI;

module.exports = Intereface;
_('CL.CLI', Intereface);