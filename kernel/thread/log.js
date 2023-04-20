const Path = require('path');
const FSP = require('fs').promises;

global.thread = require('worker_threads');
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

const Logger = new (_("Utils.Logger"))('ThreadLogger');
const history = [];
var isReady = false;

const timer = setInterval(async () => {
	if (!isReady) return;
	if (history.length === 0) return;

	var infos = [], logs = [], warns = [], errors = [], left = [], time = Date.now() - 1000, output = false;
	history.forEach(h => {
		if (h.stamp < time) {
			output = true;
			if (h.type === 0) infos.push(h);
			else if (h.type === 1) logs.push(h);
			else if (h.type === 2) warns.push(h);
			else if (h.type === 3) errors.push(h);
		}
		else {
			left.push(h);
		}
	});
	if (!output) return;

	isReady = false;
	history.splice(0, history.length);
	history.push(...left);

	time = getDate();
	var actions = [
		[infos, time, 'info'],
		[logs, time, 'log'],
		[warns, time, 'warn'],
		[errors, time, 'error']
	];
	await Promise.all(actions.map(act => outputLog(...act)));
	isReady = true;
}, thread.workerData.duration);

const getDate = () => {
	var date = new Date();
	var Y = date.getYear() + 1900;
	var M = date.getMonth() + 1;
	M = M + '';
	M = M.padStart(2, '0');
	var D = date.getDate();
	D = D + '';
	D = D.padStart(2, '0');
	return Y + '-' + M + '-' + D;
}
const outputLog = async (history, dateName, filename) => {
	if (history.length === 0) return;
	history.sort((a, b) => a.stamp - b.stamp);
	var content = history.map(item => item.msg).join('\n') + '\n';
	filename = dateName + '-' + filename + '.log';
	filename = Path.join(thread.workerData.output, filename);
	var err = await FSP.appendFile(filename, content);
	if (!!err) Logger.error(err);
};

_("Utils").preparePath(thread.workerData.output, ok => {
	isReady = true;
});

thread.parentPort.on('message', msg => {
	msg.forEach(m => {
		history.push(m);
	});
});