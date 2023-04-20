/**
 * Name:	Thread Worker
 * Desc:    线程内辅助工具
 * Author:	LostAbaddon
 * Version:	0.0.2
 * Date:	2018.11.14
 * 备注：未来可以用VM来取代eval
 */

global.thread = require('worker_threads');
global._env = 'node';
global._canThread = true;

// 加载工具包
require('../namespace.js');
require('../utils/loadall');
require('../extend');
require('../utils/datetime');
require('../utils/logger');

// 线程事务管理器

const EventEmitter = require('events');
const EE = new EventEmitter();
global.register = (tag, callback) => {
	if (tag === 'init') EE.once(tag, callback)
	else EE.on(tag, callback)
};
global.request = (event, data) => {
	thread.parentPort.postMessage({
		event,
		data,
		postAt: Date.now()
	});
};
global.send = msg => global.request('message', msg);
global.reply = (event, data) => {
	thread.parentPort.postMessage({
		eventID: event.eventID,
		originEvent: event.event,
		data,
		postAt: Date.now()
	});
};
global.suicide = () => global.request('suicide');
process.exit = global.suicide;

// 跨线程通道
global.TunnelManager = new (require('../threads/threadTunnel'))(global.request);

const evaluate = event => {
	var fun = event.data.fn;
	var data = event.data.data;
	var result;
	try {
		result = eval(fun)(data);
	}
	catch (err) {
		reply(event, { err: err.toString(), result: null });
		return;
	}
	reply(event, { err: null, result });
};
const loadFiles = files => {
	if (Array.is(files)) files.forEach(file => require(file));
	else require(files);
};

thread.parentPort.on('message', msg => {
	if (!msg.event) return;
	if (msg.event === 'evaluate') {
		evaluate(msg);
		return;
	}
	if (msg.event === 'loadfile') {
		loadFiles(msg.data);
		return;
	}
	if (msg.event === '__tunnel__') {
		if (msg.data.event === 'pull') {
			global.TunnelManager.gotPull(msg.data.id);
		}
		else if (msg.data.event === 'nil') {
			global.TunnelManager.gotNil(msg.data.id);
		}
		else if (msg.data.event === 'data') {
			global.TunnelManager.gotData(msg.data.id, msg.data.data);
		}
		else if (msg.event === 'close') {
			global.TunnelManager.closeTunnel(msg.data.id, true);
		}
		else if (msg.event === 'kill') {
			global.TunnelManager.killTunnel(msg.data.id, true);
		}
		else console.log('slaver got wrong msg >>\n', msg);
		return;
	}
	msg.receiveAt = Date.now();
	EE.emit(msg.event, msg.data, msg);
});

// 加载指定文件
if (!!thread.workerData && !!thread.workerData.scripts) {
	if (Array.is(thread.workerData.scripts)) {
		thread.workerData.scripts.forEach(fp => require(fp));
	}
	else if (String.is(thread.workerData.scripts)) {
		require(thread.workerData.scripts);
	}
}

// 触发启动事件

if (!!thread.workerData.data) EE.emit('init', thread.workerData.data, {
	event: 'init',
	data: thread.workerData.data,
	scripts: thread.workerData.scripts,
	sendAt: Date.now(),
	receiveAt: Date.now()
});