const Path = require('path');
const { Worker } = require('worker_threads');
const newLongID = _('Message.newLongID');
const Logger = new (_("Utils.Logger"))('ThreadManager');

const CTP = Symbol('CommonThreadPool');
const TxWPool = new Map();
const TxPool = new Map();
const TxPending = new Map();
var MaxWorkerLimit = require('os').cpus().length;
var TimeoutLimit = 30 * 1000;

const setConcurrence = con => {
	MaxWorkerLimit = con;
};
const setTimeoutValue = to => {
	TimeoutLimit = to;
};

const newTxWorker = (url, filepath) => {
	var timer = null;
	var tasks = [];
	var worker = new Worker(Path.join(__dirname, '../kernel/thread/tx_thread_pool.js'), {
		workerData: {
			isSlaver: global.isSlaver,
			isMultiProcess: global.isMultiProcess,
			jsPath: filepath
		}
	})
	.on('message', msg => {
		if (msg.event === "threadlog") {
			Logger.appendRecord(msg.data);
			return;
		}

		var res = TxPool.get(msg.id);
		if (!res) return;
		if (!!timer) clearTimeout(timer);
		tasks.remove(msg.id);
		TxPool.delete(msg.id);
		res(msg.result);

		if (worker.alive) {
			let workerList = TxWPool.get(url);
			workerList.working.remove(worker);
			if (!workerList.waiting.includes(worker)) workerList.waiting.push(worker);

			let taskList = TxPending.get(url);
			if (!taskList || taskList.length === 0) return;
			continueTxJob(taskList.shift());
		}
		else {
			worker.terminate();
		}
	});
	worker.alive = true;
	worker.launch = task => new Promise(res => {
		tasks.push(task.id);
		if (!!timer) clearTimeout(timer);
		timer = setTimeout(() => {
			Logger.log('事务处理线程响应超时: ' + task.id);
			var workerList = TxWPool.get(url);
			workerList.working.remove(worker);
			workerList.waiting.remove(worker);
			timer = null;
			worker.alive = false;
			worker.terminate();
			var result = new Errors.RuntimeError.RequestTimeout();
			result = {
				ok: false,
				code: result.code,
				message: result.message
			};
			tasks.forEach(t => {
				var res = TxPool.get(t);
				if (!res) return;
				TxPool.delete(t);
				res(result);
			});
			newTxWorker(url, filepath);
		}, TimeoutLimit);
		worker.postMessage(task);
	});

	TxWPool.get(url).waiting.push(worker);

	var taskList = TxPending.get(url);
	if (!!taskList) {
		let task = taskList.shift();
		if (!!task) continueTxJob(task);
	}

	return worker;
};
const newCmWorker = (url, filepath) => {
	var timer = null;
	var pending = [];
	var tasks = [];
	var jsList = {};
	var worker = new Worker(Path.join(__dirname, '../kernel/thread/cm_thread_pool.js'), {
		workerData: {
			isSlaver: global.isSlaver,
			isMultiProcess: global.isMultiProcess,
			jsModule: { url, filepath }
		}
	})
	.on('online', () => {
		if (!worker.alive || worker.ready) return;
		worker.ready = true;

		var list = pending.copy();
		pending.clear();
		list.forEach(task => {
			worker.postMessage(task);
		});
	})
	.on('exit', () => {
		worker.alive = false;
	})
	.on('message', msg => {
		if (msg.event === "threadlog") {
			Logger.appendRecord(msg.data);
			return;
		}

		var res = TxPool.get(msg.id);
		if (!res) return;
		if (!!timer) clearTimeout(timer);
		tasks.remove(msg.id);
		TxPool.delete(msg.id);
		res(msg.result);

		if (worker.alive) {
			let workerList = TxWPool.get(CTP);
			workerList.working.remove(worker);
			if (!workerList.waiting.includes(worker)) workerList.waiting.push(worker);

			let taskList = TxPending.get(CTP);
			if (!taskList || taskList.length === 0) return;
			continueCmJob(taskList.shift());
		}
		else {
			worker.terminate();
		}
	});
	worker.ready = false;
	worker.alive = true;
	worker.launch = task => new Promise(res => {
		tasks.push(task.id);
		if (!!timer) clearTimeout(timer);
		timer = setTimeout(() => {
			Logger.log('CTP线程响应超时: ' + task.id);
			var workerList = TxWPool.get(CTP);
			workerList.working.remove(worker);
			workerList.waiting.remove(worker);
			timer = null;
			worker.alive = false;
			worker.terminate();
			var result = new Errors.RuntimeError.RequestTimeout();
			result = {
				ok: false,
				code: result.code,
				message: result.message
			};
			tasks.forEach(t => {
				var res = TxPool.get(t);
				if (!res) return;
				TxPool.delete(t);
				res(result);
			});
			var w = newCmWorker(url, '');
			for (let url in jsList) {
				w.changeModule(url, jsList[url]);
			}
		}, TimeoutLimit);
		worker.postMessage(task);
	});
	worker.changeModule = (url, filepath) => {
		if (worker.ready) {
			worker.postMessage({
				action: 'changeModule',
				url, filepath
			});
		}
		else {
			pending.push({
				action: 'changeModule',
				url, filepath
			});
		}
		jsList[url] = filepath;
	};
	worker.removeModule = (url, filepath) => {
		if (worker.ready) {
			worker.postMessage({
				action: 'removeModule',
				url, filepath
			});
		}
		else {
			pending.push({
				action: 'removeModule',
				url, filepath
			});
		}
		delete jsList[url];
	};

	jsList[url] = filepath;

	TxWPool.get(CTP).waiting.push(worker);
	return worker;
};

const setupTxPool = (url, filepath) => {
	var workerList = TxWPool.get(url);
	if (!!workerList) {
		workerList.waiting.forEach(w => w.terminate());
		workerList.working.forEach(w => w.alive = false);
		workerList.waiting.clear();
		workerList.working.clear();
	}

	workerList = { waiting: [], working: [] };
	TxWPool.set(url, workerList);
	for (let i = 0; i < MaxWorkerLimit; i ++) newTxWorker(url, filepath);
};
const closeTxPool = url => {
	var workerList = TxWPool.get(url);
	if (!workerList) return
	workerList.waiting.forEach(w => w.terminate());
	workerList.working.forEach(w => w.alive = false);
	workerList.waiting.clear();
	workerList.working.clear();
};
const setupCmPool = (url, filepath) => {
	var workerList = TxWPool.get(CTP);
	if (!!workerList) {
		workerList.waiting.forEach(w => w.changeModule(url, filepath));
		workerList.working.forEach(w => w.changeModule(url, filepath));
	}
	else {
		workerList = { waiting: [], working: [] };
		TxWPool.set(CTP, workerList);
		for (let i = 0; i < MaxWorkerLimit; i ++) newCmWorker(url, filepath);
	}
};
const closeCmPool = (url, filepath) => {
	var workerList = TxWPool.get(CTP);
	if (!workerList) return
	workerList.waiting.forEach(w => w.removeModule(url, filepath));
	workerList.working.forEach(w => w.removeModule(url, filepath));
};

const continueTxJob = async task => {
	var result = await runInTxThread(...task.task, true);
	task.res(result);
};
const continueCmJob = async task => {
	var result = await runInCmThread(...task.task, true);
	task.res(result);
};

const runInThread = (responsor, param, query, url, data, method, source, ip, port) => new Promise(res => {
	Logger.log('开始执行OTE任务: ' + url + ' (' + responsor._url + ')');
	var targetJS = "const { Worker, workerData, parentPort } = require('worker_threads');";
	targetJS += 'var _fun_ =' + responsor.toString();
	targetJS += ';(async () => {var result = await _fun_(...workerData);parentPort.postMessage(result);})();';
	var target = {};
	data = data || {};
	if (Object.isBasicType(data)) {
		target = data;
	}
	else {
		for (let key in data) {
			let value = data[key];
			if (Object.isBasicType(value)) target[key] = value;
		}
	}
	try {
		var w = new Worker(targetJS, {
			eval: true,
			workerData: [param, query, url, target, method, source, ip, port]
		})
		.on('message', msg => {
			res(msg);
		})
		.on('error', err => {
			Logger.error('一次性线程执行出错: ' + err.message);
			res({
				ok: false,
				code: err.code,
				message: err.message
			});
		})
		.on('exit', () => {
			w.terminate();
			w = null;
		});
	}
	catch (err) {
		res({
			ok: false,
			code: err.code,
			message: err.message
		});
	}
});
const runInTxThread = (responsor, param, query, url, data, method, source, ip, port, inside=false) => new Promise(res => {
	var workerList = TxWPool.get(responsor._url);
	if (!workerList) {
		let err = new Errors.RuntimeError.NoRegisteredThread('请求业务: ' + url + ' (' + responsor._url + ')');
		return res({
			ok: false,
			code: err.code,
			message: err.message
		});
	}

	if (workerList.waiting.length === 0) {
		Logger.log('TTP任务入池: ' + url + ' (' + responsor._url + ')');
		let pending = TxPending.get(responsor._url);
		if (!pending) {
			pending = [];
			TxPending.set(responsor._url, pending);
		}
		let task = {
			task: [responsor, param, query, url, data, method, source, ip, port],
			res
		};
		if (inside) pending.unshift(task);
		else pending.push(task);
		return;
	}

	var worker = workerList.waiting.shift();
	workerList.working.push(worker);

	var tid = newLongID(16);
	Logger.log('开始执行TTP任务: ' + url + ' (' + responsor._url + '); TID: ' + tid);
	var target = {};
	data = data || {};
	TxPool.set(tid, res);
	if (Object.isBasicType(data)) {
		target = data;
	}
	else {
		for (let key in data) {
			let value = data[key];
			if (Object.isBasicType(value)) target[key] = value;
		}
	}
	worker.launch({id: tid, task: [param, query, url, target, method, source, ip, port]});
});
const runInCmThread = (responsor, param, query, url, data, method, source, ip, port, inside=false) => new Promise(res => {
	var workerList = TxWPool.get(CTP);
	if (!workerList) {
		let err = new Errors.RuntimeError.NoRegisteredThread('请求业务: ' + url + ' (' + responsor._url + ')');
		return res({
			ok: false,
			code: err.code,
			message: err.message
		});
	}

	if (workerList.waiting.length === 0) {
		Logger.log('CTP任务入池: ' + url + ' (' + responsor._url + ')');
		let pending = TxPending.get(CTP);
		if (!pending) {
			pending = [];
			TxPending.set(CTP, pending);
		}
		let task = {
			task: [responsor, param, query, url, data, method, source, ip, port],
			res
		};
		if (inside) pending.unshift(task);
		else pending.push(task);
		return;
	}

	var worker = workerList.waiting.shift();
	workerList.working.push(worker);

	var tid = newLongID(16);
	Logger.log('开始执行CTP任务: ' + url + ' (' + responsor._url + '); TID: ' + tid);
	var target = {};
	data = data || {};
	TxPool.set(tid, res);
	if (Object.isBasicType(data)) {
		target = data;
	}
	else {
		for (let key in data) {
			let value = data[key];
			if (Object.isBasicType(value)) target[key] = value;
		}
	}
	worker.launch({id: tid, url: responsor._url, task: [param, query, url, target, method, source, ip, port]});
});

module.exports = {
	setConcurrence,
	setTimeout: setTimeoutValue,
	setupTxPool,
	closeTxPool,
	setupCmPool,
	closeCmPool,
	runInThread,
	runInTxThread,
	runInCmThread,
};
_('Utils.ThreadManager', module.exports);