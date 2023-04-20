const Path = require('path');
const Process = require('child_process');
const Galanet = require('./galanet');
const MsgBus = require('./msgBus');
const Watcher = require('../kernel/watcher');
const Personel = require('./personel');
const newLongID = _('Message.newLongID');
const ModuleManager = _('Utils.ModuleManager');
const ThreadManager = require('../kernel/threadManager');
const { Dealer, DealerPool } = require('../kernel/dealer');
const Logger = new (_("Utils.Logger"))('Responsor');
const HotUpModuleExtName = [ 'js', 'mjs', 'cjs', 'json' ];
const NonAPIModulePrefix = '_';

global.isDelegator = false;
global.isMultiProcess = false;
global.isSlaver = false;
global.ResponsorMap = {};
global.ResponsorList = [];

const Config = {
	process: 1,
	concurrence: 10,
	services: [],
	preprocessor: [],
	postprocessor: [],
	options: null,
	defaultMode: 'process'
};
const TaskInfo = {
	total: 0,
	done: 0,
	spent: 0,
	energy: 0,
	power: 0
};
const SubProcessState = Symbol.setSymbols('IDLE', 'WAITING', 'WORKING', 'DYING', 'DIED');
var MainProcessState = SubProcessState.WORKING;
HotUpModuleExtName.forEach((ext, i) => HotUpModuleExtName[i] = '.' + HotUpModuleExtName[i]);

class TxWorker extends Dealer {
	#id = 0;
	#map = new Map();
	#worker = null;
	constructor (cfg, callback) {
		super();

		var worker = Process.fork(Path.join(__dirname, './subprocess.js'));
		this.#id = worker.pid;
		worker.on('message', async msg => {
			if (msg.event === 'online') {
				worker.send({
					event: 'initial',
					data: cfg,
					personel: global.Personel
				});
			}
			else if (msg.event === 'ready') {
				if (this.state === Dealer.State.IDLE) {
					Logger.info('Slaver Ready: ' + this.#id);
					this.state = Dealer.State.READY;
					if (!!callback) callback();
				}
			}
			else if (msg.event === 'jobdone') {
				if (this.state === Dealer.State.DIED) return;

				Logger.log('Slaver-' + worker.pid + ' Job DONE! (' + this.power + ' | ' + this.total + ' / ' + this.done + ' / ' + this.timespent + ')');

				if (this.state === Dealer.State.DYING) {
					worker.send({ event: 'suicide' });
				}

				let task = this.#map.get(msg.id);
				if (!task) return;
				this.finish(task, msg.result);
			}
			else if (msg.event === 'command') {
				process.emit(msg.action, msg.data);
			}
			else if (msg.event === 'log') {
				Logger.appendRecord(msg.data);
			}
			else if (msg.event === 'extinct') {
				extinctSlavers();
			}
			// 系统内部进程间通讯
			else if (msg.event === 'broadcast') {
				let [count, task] = await Galanet.broadcast(msg.data.msg, msg.data.toAll, msg.id);
				worker.send({
					event: 'cast_done',
					id: msg.id,
					count, task
				});
			}
			else if (msg.event === 'narrowcast') {
				let [count, task] = await Galanet.narrowcast(msg.data.msg, msg.data.count, msg.id);
				worker.send({
					event: 'cast_done',
					id: msg.id,
					count, task
				});
			}
			else if (msg.event === 'directcast') {
				let [count, task] = await Galanet.sendTo(msg.data.target, msg.data.msg, msg.id);
				worker.send({
					event: 'cast_done',
					id: msg.id,
					count, task
				});
			}
			// 收到广播信息
			else if (msg.event === 'galanet::message') {
				process.emit('galanet::message', msg.type, msg.sender, msg.msg);
			}
			else {
				Logger.log('MainProcess::OnMessage', msg);
			}
		});
		worker.on('exit', code => {
			Logger.info('Slaver Died: ' + this.#id);
			WorkerPool.removeMember(this);

			if (MainProcessState === SubProcessState.DIED && WorkerPool.count === 0) {
				destroyMonde();
			}
			else if (MainProcessState !== SubProcessState.DIED && MainProcessState !== SubProcessState.DYING) {
				forkChildren(cfg);
			}
		});

		this.#worker = worker;
	}
	start (task, callback) {
		this.#map.set(task.tid, task);
		super.start(task, callback);

		this.#worker.send({
			event: 'task',
			id: task.tid,
			responsor: task.responsor,
			data: task.data
		});
	}
	finish (task, result) {
		super.finish(task, result);
		this.#map.delete(task.tid);
	}
	send (msg) {
		if (this.state === Dealer.State.DIED || !this.#worker) return;
		this.#worker.send(msg);
	}
	suicide () {
		if (this.state === Dealer.State.DIED) return;

		this.onDied(() => {
			this.#map.clear();
			this.#map = undefined;
		});

		this.#worker.send({ event: 'suicide' });

		var err = new Errors.RuntimeError.SubProcessBrokenDown();
		this.forEach({
			ok: false,
			code: err.code,
			message: err.message
		});

		super.suicide();
	}
	get pid () {
		return this.#id;
	}
	static Limit = 10;
	static Initial = 10;
}
class TxPool extends DealerPool {
	constructor () {
		super(TxWorker);
	}
}
const WorkerPool = new TxPool();

const forkChildren = (cfg, callback) => {
	WorkerPool.addMember(new TxWorker(cfg, callback));
};
const launchWorkers = (cfg, callback) => new Promise(res => {
	var total = Config.process, count = Config.process, init = false;
	if (total < 1) {
		WorkerPool.state = DealerPool.State.READY;
		if (!!callback) callback();
		res();
		WorkerPool.launchPendingTask();
		return;
	}
	for (let i = 0; i < total; i ++) {
		forkChildren(cfg, () => {
			if (init) return;
			count --;
			if (count > 0) return;
			init = true;
			WorkerPool.state = DealerPool.State.READY;
			if (!!callback) callback();
			res();
			WorkerPool.launchPendingTask();
		});
	}
});
const loadProcessor = (list, modules) => {
	modules.forEach(filepath => {
		filepath = Path.join(process.cwd(), filepath);
		var processor;
		try {
			processor = require(filepath);
		} catch {
			Logger.error('模块 ' + filepath + ' 加载失败');
		}
		if (!!processor && Function.is(processor)) list.push(processor);
		Watcher.watchFile(filepath, () => {
			list.remove(processor);
			try {
				ModuleManager.dump(filepath);
				processor = require(filepath);
			} catch {}
			if (!!processor && Function.is(processor)) list.push(processor);
		});
	});
};

const broadcast = (msg, event) => {
	if (!global.isMultiProcess) return 0;
	var count = 0;
	WorkerPool.forEach(worker => {
		if (worker.state === Dealer.State.DIED) return;
		worker.send({
			event: event || msg.event || 'message',
			type: 'broadcast',
			msg
		});
		count ++;
	});
	return count;
};
const narrowcast = (msg, event) => {
	if (!global.isMultiProcess) return null;
	var workers = [];
	WorkerPool.forEach(worker => {
		if (worker.state === Dealer.State.DIED) return;
		workers.push(worker);
	});
	if (workers.length === 0) return null;
	var worker = workers.pick();
	if (!worker) return null;
	worker.send({
		event: event || msg.event || 'message',
		type: 'narrowcast',
		msg
	});
	return worker;
};

const setConfig = async (cfg, callback) => {
	if (Boolean.is(cfg.isDelegator)) isDelegator = cfg.isDelegator;
	if (Array.is(cfg.api.services)) Config.services.push(...cfg.api.services);
	else if (String.is(cfg.api.services)) Config.services.push(cfg.api.services);
	Config.options = cfg;
	if (Number.is(cfg.concurrence)) {
		TxWorker.Limit = cfg.concurrence;
		ThreadManager.setConcurrence(cfg.concurrence);
	}
	else {
		if (Number.is(cfg.concurrence?.process)) {
			TxWorker.Limit = cfg.concurrence.process;
		}
		if (Number.is(cfg.concurrence?.worker)) {
			ThreadManager.setConcurrence(cfg.concurrence.worker);
		}
	}
	if (Number.is(cfg.timeout)) {
		ThreadManager.setTimeout(cfg.timeout);
	}
	else if (Number.is(cfg.timeout?.worker)) {
		ThreadManager.setTimeout(cfg.timeout.worker);
	}

	loadPrePostWidget(cfg);

	var actions = [];

	if (isDelegator) {
		Config.process = 1;
		actions.push(launchWorkers(cfg));
	}
	else if (cfg.process === 'auto') {
		Config.process = require('os').cpus().length;
	}
	else if (Number.is(cfg.process)) {
		Config.process = Math.floor(cfg.process);
		if (Config.process < 0) Config.process = 0;
	}

	if (Config.process > 0 && !isDelegator) {
		isMultiProcess = true;
		actions.push(launchWorkers(cfg));
	}
	else {
		actions.push(wait());
	}

	actions.push(Personel.init(cfg));
	actions.push(Galanet.setConfig(cfg));
	await Promise.all(actions);

	// 通知 Galanet 都准备好了，开始握手
	Galanet.shakehand();

	callback();
};
const setConcurrence = count => {
	if (count >= 0) {
		Config.concurrence = count;
		return true;
	}
	return false;
};
const setProcessCount = count => {
	if (count >= 0) {
		Config.process = count;
		Config.options.process = count;
		return true;
	}
	return false;
};
const restartWorkers = async () => {
	if (!isMultiProcess) return;
	processStat = ProcessStat.INIT;

	var actions = [];
	WorkerPool.forEach(worker => {
		worker.suicide();
	});
	WorkerPool.clear();
	await launchWorkers(Config.options);

	processStat = ProcessStat.READY;
};

const loadPrePostWidget = cfg => {
	if (!!cfg.api?.preprocessor) {
		loadProcessor(Config.preprocessor, cfg.api.preprocessor);
	}
	if (!!cfg.api?.postprocessor) {
		loadProcessor(Config.postprocessor, cfg.api.postprocessor);
	}
};
const loadResponseFile = (path, filepath) => {
	var low = filepath.toLowerCase();
	if (!HotUpModuleExtName.some(ext => low.substring(low.length - ext.length, low.length) === ext)) return;

	var url = filepath.replace(path, '');
	var parts = url.split(/[\/\\]+/).filter(f => f.length > 0);
	var last = parts.last;
	if (!!last.match(/\.js$/i)) {
		last = last.substr(0, last.length - 3);
		if (last === 'index') {
			parts.splice(parts.length - 1, 1);
		}
		else {
			parts[parts.length - 1] = last;
		}
	}
	url = '/' + parts.join('/');
	parts = parts.map(part => {
		if (!!part.match(/^\[.*\]$/)) {
			return {
				name: part.replace(/^\[+|\]+$/g, ''),
				dynamic: true
			};
		}
		else {
			return {
				name: part,
				dynamic: false
			};
		}
	});

	var lastMode = ResponsorMap[url];
	if (!lastMode) lastMode = Config.defaultMode;
	else lastMode = lastMode.mode || Config.defaultMode;

	var res = require(filepath);
	if (!res || !res.responsor || (filepath.indexOf(NonAPIModulePrefix) === 0)) return;

	if (!res.methods) {
		res.methods = null;
	}
	else if (String.is(res.methods)) {
		if (res.methods === '' || res.methods === 'all') res.methods = null;
		else res.methods = [res.methods];
	}
	else if (!Array.is(res.methods)) res.methods = null;

	if (!res.sources) {
		res.sources = null;
	}
	else if (String.is(res.sources)) {
		if (res.sources === '' || res.sources === 'all') res.sources = null;
		else res.sources = [res.sources];
	}
	else if (!Array.is(res.sources)) res.sources = null;

	res._queryList = parts;
	res.responsor._url = url;
	res.mode = res.mode || Config.defaultMode;
	res.responsor.mode = res.mode;

	if (!global.isDelegator && (!global.isMultiProcess || global.isSlaver)) {
		if (res.mode === 'tx_thread_pool') {
			if (lastMode === 'cm_thread_pool') ThreadManager.closeCmPool(url, filepath);
			ThreadManager.setupTxPool(url, filepath);
		}
		if (res.mode === 'cm_thread_pool') {
			if (lastMode === 'tx_thread_pool') ThreadManager.closeTxPool(url);
			ThreadManager.setupCmPool(url, filepath);
		}
		else {
			if (lastMode === 'tx_thread_pool') ThreadManager.closeTxPool(url);
			else if (lastMode === 'cm_thread_pool') ThreadManager.closeCmPool(url, filepath);
		}
	}

	ResponsorMap[url] = res;
	ResponsorList.push(res);
};
const unloadResponseFile = (path, filepath) => {
	ModuleManager.dump(filepath); // 从require的内部库中移除JS模块

	var url = filepath.replace(path, '');
	var parts = url.split(/[\/\\]+/).filter(f => f.length > 0);
	var last = parts.last;
	if (!!last.match(/\.js$/i)) {
		last = last.substr(0, last.length - 3);
		if (last === 'index') {
			parts.splice(parts.length - 1, 1);
		}
		else {
			parts[parts.length - 1] = last;
		}
	}
	url = '/' + parts.join('/');

	var res = ResponsorMap[url];
	ResponsorList.remove(res);
	delete ResponsorMap[url];
};
const loadResponsors = async (path, monitor=true) => {
	path = path.replace(/[\/\\]+$/, '') + Path.sep;

	var list;
	// 监视目标路径的更新情况
	if (monitor) {
		list = await Watcher.add(path, (event, filepath) => {
			if (event === Watcher.EventType.NewFile) {
				Logger.log('新增API模块：' + filepath);
				loadResponseFile(path, filepath);
			}
			else if (event === Watcher.EventType.ModifyFile) {
				Logger.log('更新API模块：' + filepath);
				unloadResponseFile(path, filepath);
				loadResponseFile(path, filepath);
			}
			else if (event === Watcher.EventType.DeleteFile) {
				Logger.log('移除API模块：' + filepath);
				unloadResponseFile(path, filepath);
			}
		});
	}
	else {
		list = await _('Utils.getAllContents')(path);
	}

	list.forEach(filepath => loadResponseFile(path, filepath));
};
const getContext = (ctx, source) => {
	var data = {};
	if (source === 'web') {
		data = ctx.request;
	}
	else if (source === 'socket') {
		data = {
			id: ctx.id,
			rooms: ctx.rooms,
			handshake: ctx.handshake,
		};
	}
	else {
		data = ctx;
	}

	var copy;
	try {
		copy = JSON.parse(JSON.stringify(data));
	}
	catch {
		copy = data.clearCopy();
	}
	return copy;
};

const matchResponsor = (url, method, source) => {
	var res = ResponsorMap[url], query = {}, didMatch = false;
	if (!!res) {
		if (res.sources === null || res.sources === 'all' || res.sources === source || (!!res.sources.includes && (res.sources.includes(source) || res.sources.includes('all')))) didMatch = true;
		if (didMatch) {
			didMatch = false;
			if (res.methods === null || res.methods === 'all' || res.methods === method || (!!res.methods.includes && (res.methods.includes(method) || res.methods.includes('all')))) didMatch = true;
			if (didMatch) {
				let resp = res.responsor;
				resp.mode = res.mode;
				return [resp, query];
			}
		}
	}

	url = url.split('/').filter(u => u.length > 0);
	res = null;
	var len = url.length;
	ResponsorList.some(r => {
		var q = r._queryList, qry = {};
		if (q.length !== len) return;
		for (let i = 0; i < len; i ++) {
			let qi = q[i];
			if (qi.dynamic) {
				qry[qi.name] = url[i];
			}
			else {
				if (url[i] !== qi.name) return;
			}
		}

		if (r.sources === null || r.sources === 'all' || r.sources === source || (!!r.sources.includes && (r.sources.includes(source) || r.sources.includes('all')))) didMatch = true;
		if (didMatch) {
			didMatch = false;
			if (r.methods === null || r.methods === 'all' || r.methods === method || (!!r.methods.includes && (r.methods.includes(method) || r.methods.includes('all')))) didMatch = true;
			if (!didMatch) {
				return;
			}
		}
		else {
			return;
		}

		res = r.responsor;
		res.mode = r.mode || Config.defaultMode;
		query = qry;
		return true;
	});

	if (isDelegator) {
		res = res || {_url: url};
	}

	return [res, query];
};
const launchResponsor = async (responsor, param, query, url, data, method, source, ip, port) => {
	if (processStat !== ProcessStat.READY) return;

	var result;
	if (url.substr(0, 1) !== '/') url = '/' + url;
	param = param || {};
	var sender = (!!param.originSource || !!param.originHost + !!param.originPort)
		? (param.originSource + '/' + param.originHost + '/' + param.originPort)
		: (source + '/' + ip + '/' + port), sendInfo = method + ':' + url;

	if (url.indexOf('/galanet/') === 0) {
		if (Galanet.check(ip)) {
			Logger.log("Galanet请求(" + sender + "): " + sendInfo + '; Q: ' + JSON.stringify(query) + '; P: ' + JSON.stringify(param));
			if (url === '/galanet/message' || url.indexOf('/galanet/message/') === 0) {
				if (!!param.mid) {
					if (MsgBus.hasMsgRecord(param.mid)) {
						let err = new Errors.GalanetError.DuplicatedMessage('MessageID: ' + param.mid);
						result = {
							ok: false,
							code: err.code,
							message: err.message
						};
					}
					else {
						MsgBus.addMsgRecord(param.mid);
						result = await launchLocalResponsor(responsor, param, query, url, data, method, source, ip, port);
					}
				}
				else {
					result = await launchLocalResponsor(responsor, param, query, url, data, method, source, ip, port);
				}
			}
			else {
				result = await launchLocalResponsor(responsor, param, query, url, data, method, source, ip, port);
			}
		}
		else {
			Logger.error("未授权的Galanet请求(" + sender + "): " + sendInfo);
			let err = new Errors.GalanetError.Unauthorized();
			result = {
				ok: false,
				code: err.code,
				message: err.message
			};
		}
	}
	else {
		if (isDelegator) { // 如果本节点是纯代理节点，则转发给集群友机
			Logger.log("网关转发请求(" + sender + "): " + sendInfo + '; Q: ' + JSON.stringify(query) + '; P: ' + JSON.stringify(param));
			result = await Galanet.launch(responsor, param, query, url, data, method, source, ip, port);
		}
		else if (!!param && param.isGalanet) { // 如果声称是集群请求
			if (Galanet.check(ip)) { // 如果是集群中友机的请求，则本地处理
				if (Galanet.checkService(url)) { // 如果是本地注册的请求，则本地处理
					Logger.log("Galanet请求(" + sender + "): " + sendInfo + '; Q: ' + JSON.stringify(query) + '; P: ' + JSON.stringify(param));
					result = await launchLocalResponsor(responsor, param, query, url, data, method, source, ip, port);
				}
				else { // 如果不是本地注册的请求，则不做处理
					Logger.error("不可用Galanet请求(" + sender + "): " + sendInfo);
					let err = new Errors.GalanetError.CannotService(url + '不是可服务请求类型');
					result = {
						ok: false,
						code: err.code,
						message: err.message
					};
				}
			}
			else { // 不是集群中友机请求，则不作处理
				Logger.error("集群外Galanet请求(" + sender + "): " + sendInfo);
				let err = new Errors.GalanetError.NotFriendNode(ip + '不是集群友机');
				result = {
					ok: false,
					code: err.code,
					message: err.message
				};
			}
		}
		else { // 如果没声称是集群请求
			Logger.log("收到请求(" + sender + "): " + sendInfo);
			if (!Galanet.isInGroup) {
				result = await launchLocalResponsor(responsor, param, query, url, data, method, source, ip, port);
			}
			else { // 如果在集群中，且不是集群指令，则交给集群中心Galanet处理
				result = await Galanet.launch(responsor, param, query, url, data, method, source, ip, port);
			}
		}
	}

	return result;
};
const launchLocalResponsor = async (responsor, param, query, url, data, method, source, ip, port) => {
	var result;
	if (!isMultiProcess) {
		TaskInfo.total ++;
		let time = now();
		try {
			result = await doJob(responsor, param, query, url, data, method, source, ip, port);
		}
		catch (err) {
			Logger.error(err);
			result = {
				ok: false,
				code: err.code || 500,
				message: err.message
			};
		}
		TaskInfo.done ++;
		time = now() - time;
		TaskInfo.spent += time;
		TaskInfo.energy = TaskInfo.spent / TaskInfo.done;
		TaskInfo.power = (TaskInfo.energy * 2 + time) / 3;
	}
	else {
		// 如果发送到非fork进程或当前进程时，data中的数据可能会导致发送出错，所以这里需要clearcopy为纯JSON对象
		data = getContext(data, source);
	
		result = await WorkerPool.launchTask({
			tid: newLongID(),
			responsor: responsor._url,
			data: { param, query, url, data, method, source, ip, port },
			stamp: now()
		});
	}

	return result;
};
const doJob = async (responsor, param, query, url, data, method, source, ip, port) => {
	var resume = true, result;
	data = data || {};
	if (Config.preprocessor.length > 0) {
		for (let pro of Config.preprocessor) {
			let r = await pro(param, query, url, data, method, source, ip, port);
			if (!!r && !r.ok) {
				result = r;
				resume = false;
				break;
			}
		}
	}
	if (!resume) return result;

	if (responsor.mode === 'thread_once') {
		result = await ThreadManager.runInThread(responsor, param, query, url, data, method, source, ip, port);
	}
	else if (responsor.mode === 'tx_thread_pool') {
		result = await ThreadManager.runInTxThread(responsor, param, query, url, data, method, source, ip, port);
	}
	else if (responsor.mode === 'cm_thread_pool') {
		result = await ThreadManager.runInCmThread(responsor, param, query, url, data, method, source, ip, port);
	}
	else {
		result = await responsor(param, query, url, data, method, source, ip, port);
	}

	if (Config.postprocessor.length > 0) {
		for (let pro of Config.postprocessor) {
			let r = await pro(result, param, query, url, data, method, source, ip, port);
			if (!!r) break;
		}
	}
	return result;
};

const extinctSlavers = () => {
	if (isSlaver) return;

	if (MainProcessState !== SubProcessState.DIED) {
		MainProcessState = SubProcessState.DIED;
		if (Config.process <= 1) {
			destroyMonde();
		}
		else {
			WorkerPool.suicide();
		}
	}
};
const destroyMonde = () => {
	var err = new Errors.RuntimeError.MainProcessExited();
	WorkerPool.suicide(err);

	process.exit();
};

const getUsage = () => {
	var result = {};
	result.isDelegator = global.isDelegator;
	result.isInGroup = Galanet.isInGroup;
	result.processCount = Config.process < 1 ? 1 : Config.process;
	result.concurrence = Config.concurrence;
	result.pending = WorkerPool.pending;
	result.workers = [];
	result.connections = Config.options.port;
	if (isMultiProcess) {
		WorkerPool.forEach(worker => {
			var info = {
				alive: (worker.state !== Dealer.State.DYING && worker.state !== Dealer.State.DIED),
				total: worker.total,
				done: worker.done,
				spent: worker.timespent,
				energy: worker.energy,
				power: worker.power
			};
			result.workers.push(info);
		});
	}
	else {
		let info = {
			alive: true,
			total: TaskInfo.total,
			done: TaskInfo.done,
			spent: TaskInfo.spent,
			energy: TaskInfo.energy,
			power: TaskInfo.power
		};
		result.workers.push(info);
	}
	return result;
};

module.exports = {
	setConfig,
	loadProcessor: loadPrePostWidget,
	load: loadResponsors,
	match: matchResponsor,
	launch: launchResponsor,
	launchLocally: launchLocalResponsor,
	doJob,
	setConcurrence,
	setProcessCount,
	extinct: extinctSlavers,
	broadcast,
	narrowcast,
	refresh: restartWorkers,
	getUsage,
	get processCount () {
		return WorkerPool.count;
	}
};
_('Core.Responsor', module.exports);