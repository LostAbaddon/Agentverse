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
require('../log');
const Logger = new (_("Utils.Logger"))('TxThreadPool');

var responsor;
try {
	responsor = require(thread.workerData.jsPath);
}
catch (err) {
	Logger.error('TTP线程加载业务模块(' + thread.workerData.jsPath + ')失败: ' + err.message);
	return;
}
if (!responsor || !responsor.responsor) return;
responsor = responsor.responsor;

thread.parentPort.on('message', async msg => {
	var result;
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
	thread.parentPort.postMessage({id: msg.id, result});
});