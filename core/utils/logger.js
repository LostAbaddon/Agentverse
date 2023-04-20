/**
 * Name:	Logger Extension
 * Desc:    日志记录拓展
 * Author:	LostAbaddon
 * Version:	0.0.3
 * Date:	2019.06.24
 */

const setStyle = require('../commandline/setConsoleStyle');
const timeNormalize = _("Utils").getTimeString;
const symbPrint = Symbol('print');
const types = {
	info:  0,
	log:   1,
	warn:  2,
	error: 3,
	trace: 3
};
const prefix = {
	info: 'log',
	log: 'log',
	warn: 'error',
	error: 'error',
	trace: 'log'
};
const methods = {
	info: 'info', // 'log',
	log: 'log', // 'dir',
	warn: 'warn', // 'dir',
	error: 'error',
	trace: 'trace'
};
const postfixes = {
	info: null,
	log: null, // {depth: 100, colors: true},
	warn: null, // {depth: 100},
	error: null,
	trace: null,
};

var LogLevel = 0;

class Logger {
	colors = {};
	lable = '';
	filepath = '';
	constructor (lable, filepath, colors) {
		if (!String.is(lable)) {
			colors = lable;
			lable = '';
			filepath = '';
		} else if (!String.is(filepath)) {
			colors = filepath;
			filepath = '';
		}
		colors = colors || logger.Colors.copy();
		for (let color in colors) {
			let style = setStyle.styles[colors[color]] || setStyle.styles[global.logger.Color[color]];
			this.colors[color] = style;
		}
		if (!!lable) this.lable = lable;
		if (!!filepath) this.filepath = filepath;
	}
	[symbPrint] (type, ...args) {
		var lev = types[type];
		if (LogLevel > lev) return;
		var lable = '[ ';
		lable = lable + type.toUpperCase().padEnd(6);
		if (!!this.lable) lable = lable + this.lable + ' ';
		lable = lable + '(' + timeNormalize().padEnd(19) + ')';
		if (!!this.filepath) lable = lable + ' <' + this.filepath + '>';
		lable = lable + ' ]';
		var color = this.colors[type]
		lable = setStyle(color.open + lable + color.close, 'bold');
		console[prefix[type]](lable);
		var postfix = postfixes[type];
		if (methods[type] === 'dir') {
			args.forEach(arg => {
				if (!!postfix) console.dir(arg, postfix);
				else console.dir(arg);
			});
		} else {
			if (!!postfix) args.push(postfix);
			console[methods[type]](...args);
		}
	}
	info (...args) {
		this[symbPrint]('info', ...args);
	}
	log (...args) {
		this[symbPrint]('log', ...args);
	}
	warn (...args) {
		this[symbPrint]('warn', ...args);
	}
	error (...args) {
		this[symbPrint]('error', ...args);
	}
	trace (...args) {
		this[symbPrint]('trace', ...args);
	}
	get raw () {
		return console;
	}
}

const logger = (...args) => {
	return new Logger(...args);
};
logger.setDefaultLogLevel = lev => {
	if (!Number.is(lev)) return;
	if (lev < 0) return;
	LogLevel = lev;
};
logger.getLogLevel = lev => Number.is(lev) ? lev : (types[lev] || 0);
logger.Colors = {
	info: 'yellow',
	log: 'green',
	warn: 'magenta',
	error: 'red',
	trace: 'magenta'
};

global.logger = logger;