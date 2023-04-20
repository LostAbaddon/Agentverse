const Path = require('path');
const setStyle = _('CL.SetStyle');

var thread;
var output2File = false;

class LogRecord {
	level = 0;
	stamp = 0;
	title = '';
	data = '';
	constructor (level, title, ...msgs) {
		this.level = level;
		this.title = title;
		this.stamp = new Date();
		var datas = [];
		msgs.forEach(msg => {
			if (Object.isBasicType(msg)) {
				datas.push(msg.toString());
			}
			else {
				let tmp;
				try {
					if (msg instanceof Error) {
						tmp = msg.stack || msg.message || msg.toString();
					}
					else if (Function.is(msg)) {
						tmp = msg.toString();
					}
					else {
						tmp = JSON.stringify(msg, null, '    ');
					}
				}
				catch {
					tmp = "{...}";
				}
				datas.push(tmp);
			}
		});
		this.data = datas;
	}
	getDateTime (short=true) {
		var date = this.stamp;
		var Y = date.getYear() + 1900;
		var M = date.getMonth() + 1;
		M = M + '';
		M = M.padStart(2, '0');
		var D = date.getDate();
		D = D + '';
		D = D.padStart(2, '0');
		var h = date.getHours();
		h = h + '';
		h = h.padStart(2, '0');
		var m = date.getMinutes();
		m = m + '';
		m = m.padStart(2, '0');
		var s = date.getSeconds();
		s = s + '';
		s = s.padStart(2, '0');
		if (short) return Y + '/' + M + '/' + D + ' ' + h + ':' + m + ':' + s;

		var ms = date.getMilliseconds();
		ms = ms + '';
		ms = ms.padStart(3, '0');
		return Y + '/' + M + '/' + D + ' ' + h + ':' + m + ':' + s + '.' + ms;
	}
	toPlain () {
		// 输出到文件
		var head = '[' + this.title + ' (' + this.getDateTime(false) + ')]';
		var body = this.data.join(' ');
		return head + ' ' + body;
	}
	toPrint () {
		// 打印到屏幕
		var head = '[' + this.title + ' <' + LogRecord.levelName[this.level] + '> (' + this.getDateTime() + ')]';
		head = setStyle(head, LogRecord.levelColor[this.level]);
		var body = this.data.join(' ');
		return head + ' ' + body;
	}
}
LogRecord.levelName  = [ 'info',   'log',   'warn',    'error' ];
LogRecord.levelColor = [ 'yellow', 'green', 'magenta', 'red'   ];

class Logger {
	#mainTitle = 'MAIN-PRO';
	#subTitle = 'P-' + process.pid;
	#name = "";
	#limit = 0;
	#history = [];
	#timer = null;
	constructor (moduleName) {
		this.#name = moduleName;
	}
	info (...item) {
		if (Logger.LogLimit > 0) return;
		item = new LogRecord(0, this.#getFullTitle(), ...item);
		this.#record(item);
	}
	log (...item) {
		if (Logger.LogLimit > 1) return;
		item = new LogRecord(1, this.#getFullTitle(), ...item);
		this.#record(item);
	}
	warn (...item) {
		if (Logger.LogLimit > 2) return;
		item = new LogRecord(2, this.#getFullTitle(), ...item);
		this.#record(item);
	}
	error (...item) {
		if (Logger.LogLimit > 3) return;
		item = new LogRecord(3, this.#getFullTitle(), ...item);
		this.#record(item);
	}
	appendRecord (item) {
		if (Logger.LogLimit > item.level) return;
		var rec = new LogRecord(item.level, item.title, ...item.data);
		rec.stamp = new Date(item.stamp);
		this.#record(rec);
	}
	flush () {
		if (this.#history.length === 0) return;
		this.#history.sort((a, b) => a.stamp - b.stamp);
		var now = Date.now();
		var not = [], has = false, list = [], need = false;
		this.#history.forEach(log => {
			if (log.stamp.getTime() <= now) {
				if (!Logger.Silence) console[LogRecord.levelName[log.level]](log.toPrint());
				list.push(log);
				need = true;
			}
			else {
				not.push(log);
				has = true;
			}
		});
		this.#history = not;
		if (need && output2File) thread.postMessage(list.map(item => {
			return {
				stamp: item.stamp.getTime(),
				type: item.level,
				msg: item.toPlain()
			};
		}));
		if (has) this.#update();
	}
	#getFullTitle () {
		var fullTitle = [];
		if (global.isSlaver) {
			fullTitle.push(this.#subTitle);
		}
		else if (global.isMultiProcess) {
			fullTitle.push(this.#mainTitle);
		}
		if (!!global.thread && !!global.thread.threadId) fullTitle.push('T-' + global.thread.threadId);
		fullTitle.push(this.#name);
		return fullTitle.join('::');
	}
	#update () {
		if (!!this.#timer) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => {
			this.#timer = null;
			this.flush();
		}, Logger.FlushDuration);
	}
	#record (item) {
		if (!!global.thread && !global.thread.isMainThread) {
			global.thread.parentPort.postMessage({
				event: 'threadlog',
				data: item
			});
		}
		else if (global.isSlaver) {
			process.send({
				event: 'log',
				data: item
			});
		}
		else {
			this.#history.push(item);
			this.#update();
		}
	}
}
Logger.LogLimit = 0;
Logger.Silence = false;
Logger.FlushDuration = 100;
Logger.OutputDuration = 1000 * 10;
Logger.setOutput = filepath => {
	if (!filepath) return;
	var thd = new Logger('LoggerThreadCenter');
	output2File = true;
	thread = require('worker_threads').Worker;
	thread = new thread(Path.join(__dirname, './thread/log.js'), {
		workerData : {
			output: Path.join(process.cwd(), filepath),
			duration: Logger.OutputDuration,
			isSlaver: global.isSlaver,
			isMultiProcess: global.isMultiProcess
		}
	}).on('message', msg => {
		if (msg.event === 'threadlog') {
			thd.appendRecord(msg.data);
		}
	});
};

_("Utils.Logger", Logger);