global.noEventModules = true;

const Path = require('path');
require("../core");
loadall(__dirname, "../core/datastore");
loadall(__dirname, "../kernel", false);
const ResponsorManager = require('./responser');
const ThreadManager = require('../kernel/threadManager');
const Galanet = require('./galanet');
const Shakehand = _('Message.Shakehand');
const Logger = new (_("Utils.Logger"))('SubProcess');

global.isSlaver = true;
const Config = { path: '', services: [] };

const setConfig = async cfg => {
	if (Array.is(cfg.api?.services)) {
		Config.services.push(...cfg.api.services);
	}
	if (Number.is(cfg.concurrence)) {
		ThreadManager.setConcurrence(cfg.concurrence);
	}
	else if (Number.is(cfg.concurrence?.worker)) {
		ThreadManager.setConcurrence(cfg.concurrence.worker);
	}
	if (Number.is(cfg.timeout)) {
		ThreadManager.setTimeout(cfg.timeout);
	}
	else if (Number.is(cfg.timeout?.worker)) {
		ThreadManager.setTimeout(cfg.timeout.worker);
	}

	if (!!cfg.api?.local) {
		Config.path = cfg.api.local;
		await ResponsorManager.load(Path.join(process.cwd(), Config.path));
	}
	ResponsorManager.loadProcessor(cfg);
	await Galanet.setConfig(cfg);

	var Core = {
		responsor: ResponsorManager,
		galanet: Galanet
	};
	if (Array.is(cfg.init)) {
		cfg.init.forEach(path => {
			if (!String.is(path)) return;
			if (path.indexOf('.') === 0) path = Path.join(process.cwd(), path);
			let fun = require(path);
			if (Function.is(fun)) fun(Core);
		});
	}
	else if (String.is(cfg.init)) {
		let path = cfg.init;
		if (path.indexOf('.') === 0) path = Path.join(process.cwd(), path);
		let fun = require(path);
		if (Function.is(fun)) fun(Core);
	}

	process.send({ event: 'ready' });
};
const doTask = async (tid, target, data) => {
	var result;
	var resp = ResponsorMap[target];
	if (!resp) {
		let err = new Errors.RuntimeError.ResponsorModuleMissing('module: ' + target);
		result = {
			ok: false,
			code: err.code,
			message: err.message
		};
	}
	else {
		let responsor = resp.responsor;
		responsor.mode = resp.mode;
		try {
			result = await ResponsorManager.doJob(responsor, data.param, data.query, data.url, data.data, data.method, data.source, data.ip, data.port);
		}
		catch (err) {
			Logger.error(err);
			result = {
				ok: false,
				code: err.code,
				message: err.message
			};
		}
	}
	process.send({
		event: 'jobdone',
		id: tid,
		result
	});
};

process.on('message', async msg => {
	if (msg.event === 'initial') {
		await setConfig(msg.data);
		global.Personel = msg.personel;
		global.PersonCard = (new Shakehand(msg.personel.id, msg.personel.publicKey, Config.services, global.isDelegator));
	}
	else if (msg.event === 'task') {
		doTask(msg.id, msg.responsor, msg.data);
	}
	else if (msg.event === 'cast_done') {
		Galanet.castDone(msg.id, msg.count, msg.task);
	}
	else if (msg.event === 'suicide') {
		process.exit();
	}
	else if (msg.event === 'loadjs') {
		if (!msg.msg) return;

		let filepaths;
		if (Array.is(msg.msg)) {
			filepaths = msg.msg.filter(f => String.is(f));
		}
		else if (String.is(msg.msg)) {
			filepaths = [msg.msg];
		}
		else if (Array.is(msg.msg.path)) {
			filepaths = msg.msg.path.filter(f => String.is(f));
		}
		else if (String.is(msg.msg.path)) {
			filepaths = [msg.msg.path];
		}
		else {
			return;
		}
		filepaths.forEach(filepath => {
			if (filepath.indexOf('.') === 0) filepath = Path.join(process.cwd(), filepath);
			try {
				require(filepath);
			}
			catch (err) {
				Logger.error('载入文件 ' + filepath + ' 失败：' + err.message);
			}
		});
	}
	else {
		// Logger.info('SubProcess(' + process.pid + ')::Message', msg);
	}
});

process.send({ event: 'online' });