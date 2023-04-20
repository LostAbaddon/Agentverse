global.thread = require('worker_threads');

// 设置环境变量
global._env = 'node';
global._canThread = true;
global.isSlaver = thread.workerData.isSlaver;
global.isMultiProcess = thread.workerData.isMultiProcess;

// 加载工具包
require('../../core/namespace.js');
require('../../core/utils/loadall');
require('../../core/extend');
require('../../core/fs/prepare');
require('../../kernel/error');
require('../log');
const ModuleManager = require('../../core/moduleManager');
const Logger = new (_("Utils.Logger"))('TxThreadPool');
const responsors = new Map();

const removeModule = (url, filepath) => {
	var resp = responsors.get(url);
	if (!resp) return;
	responsors.delete(url);
	ModuleManager.dump(filepath);
};
const addModule = (url, filepath) => {
	let resp;
	try {
		resp = require(filepath);
	}
	catch (err) {
		resp = null;
		Logger.error('CTP线程加载业务模块(' + filepath + ')失败: ' + err.message);
		return false;
	}
	if (!!resp && resp.responsor) {
		responsors.set(url, resp.responsor);
		Logger.info('CTP线程加载业务模块(' + filepath + ')成功');
		return true;
	}
	return false;
};

if (!!thread.workerData.jsModule.url && !!thread.workerData.jsModule.filepath) {
	addModule(thread.workerData.jsModule.url, thread.workerData.jsModule.filepath);
}

thread.parentPort.on('message', async msg => {
	if (msg.action === "changeModule") {
		if (!!msg.url && !!msg.filepath) {
			removeModule(msg.url, msg.filepath);
			addModule(msg.url, msg.filepath);
		}
	}
	else if (msg.action === "removeModule") {
		if (!!msg.url && !!msg.filepath) {
			removeModule(msg.url, msg.filepath);
		}
	}
	else {
		let result, responsor = responsors.get(msg.url);
		if (!responsor) {
			let err = new Errors.RuntimeError.ResponsorModuleMissing('CTP业务路径: ' + msg.url);
			result = {
				ok: false,
				code: err.code,
				message: err.message
			};
		}
		else {
			try {
				result = await responsor(...(msg.task));
			}
			catch (err) {
				result = {
					ok: false,
					code: err.code,
					message: err.message
				};
			}
		}
		thread.parentPort.postMessage({id: msg.id, result});
	}
});