const Path = require('path');
const Net = require('net');
const Axios = require('axios');
const TCP = require('../kernel/tcp');
const UDP = require('../kernel/udp');
const { Dealer, DealerPool } = require('../kernel/dealer');
const Personel = require('./personel');
const MsgBus = require('./msgBus');
const newLongID = _('Message.newLongID');
const Shakehand = _('Message.Shakehand');
const Logger = new (_("Utils.Logger"))('Galanet');
const LRUCache = _('DataStore.LRUCache');
var ResponsorManager;

const ReshakeInterval = 1000 * 60; // 每过一分钟自动重连一次
const AvailableSource = [ 'tcp', 'udp', 'http' ];
const Config = {
	prefix: '',
	services: [],
	fastServices: new LRUCache(100),
	timeout: 10000,
};
const Pending = [];
const Reshakings = new Map();
var TimerShaking = null;

class RichAddress extends Dealer {
	#name = '';
	protocol = '';
	host = '';
	port = '';
	connFail = 0;
	filter = new Set();  // 本地转发哪些服务
	constructor (protocol, host, port, filter) {
		super();
		this.state = Dealer.State.READY;
		if (!host) {
			if (String.is(protocol)) {
				protocol = RichAddress.parse(protocol);
			}
			if (protocol instanceof RichAddress) {
				this.#name = protocol.name;
				this.protocol = protocol.protocol;
				this.host = protocol.host;
				this.port = protocol.port;
				protocol.filter.forEach(f => this.filter.add(f));
			}
			else {
				return;
			}
		}
		else if (!!protocol) {
			if (AvailableSource.indexOf(protocol) < 0) return;
			this.protocol = protocol;
			this.host = host;
			this.port = port;
			if (String.is(filter)) filter = [filter];
			if (Array.is(filter)) filter.forEach(f => this.filter.add(f));
			this.#name = protocol + '/' + host + '/' + port;
		}
		this.connected = false;
	}
	addFilter (filter) {
		// filter中为空表示对所有服务都可转发
		if (!filter) return;
		if (this.filter.size === 0) return;
		if (Array.is(filter)) {
			if (filter.length === 0) {
				this.filter.clear();
				return;
			}
			filter.forEach(f => this.filter.add(f));
		}
		else if (filter instanceof Set) {
			if (filter.size === 0) {
				this.filter.clear();
				return;
			}
			for (let f of filter) {
				this.filter.add(f);
			}
		}
	}
	equal (conn) {
		if (String.is(conn)) conn = RichAddress.parse(conn);
		else if (!(conn instanceof RichAddress)) return false;
		if (!conn) return false;
		return this.name === conn.name;
	}
	toString () {
		return this.fullname;
	}
	suicide () {
		this.onDied(() => {
			this.filter.clear();
			delete this.filter;
			this.#name = '';
			this.protocol = '';
			this.host = '';
			this.port = '';
		});
		super.suicide();
	}
	get name () {
		return this.#name;
	}
	get fullname () {
		return this.#name + '/' + [...this.filter].join('|');
	}
	get isEmpty () {
		return !this.#name;
	}
	static parse (node) {
		var conn = node.split('/');
		var source = conn[0];
		if (AvailableSource.indexOf(source) < 0) return null;
		var ip = conn[1], port = conn[2] * 1, filter = conn.splice(3, conn.length).filter(f => !!f && f.length > 0).join('/');
		if (!Net.isIP(ip) || !Number.is(port)) return null;
		var info = new RichAddress(source, ip, port, filter);
		return info;
	}
	static Limit = 5;
	static Initial = 10;
}
class UserNode extends Dealer {
	name = "";
	pubkey = "";
	isDelegator = false;
	#services = new Set(); // 对方接受的服务类型
	#pool = new DealerPool(RichAddress);
	#availableConnCount = -1;
	constructor (name) {
		super();
		this.state = Dealer.State.READY;
		this.#pool.state = DealerPool.State.READY;
		if (!!name) this.name = name;
	}
	addConn (conn) {
		if (this.state === Dealer.State.DYING || this.state === Dealer.State.DIED) return;

		if (String.is(conn)) conn = RichAddress.parse(conn);
		else if (!(conn instanceof RichAddress)) return;
		if (!conn || conn.isEmpty) return;

		this.#availableConnCount = -1;
		var has = false;
		this.#pool.forEach(cn => {
			if (has) return;
			if (!cn.equal(conn)) return;
			cn.addFilter(conn.filter);
			has = true;
		});
		if (!has) this.#pool.addMember(conn);
	}
	removeConn (conn) {
		if (this.state === Dealer.State.DYING || this.state === Dealer.State.DIED) return 0;

		if (String.is(conn)) conn = RichAddress.parse(conn);
		else if (!(conn instanceof RichAddress)) return 0;
		if (!conn) return 0;

		this.#availableConnCount = -1;
		var target = [];
		this.#pool.forEach(cn => {
			if (cn.equal(conn)) target.push(cn);
		});
		if (target.length === 0) return 0;
		target.forEach(t => this.#pool.removeMember(t));
		return target.length;
	}
	forEach (cb) {
		if (this.state === Dealer.State.DYING || this.state === Dealer.State.DIED) return;
		this.#pool.forEach(cb);
	}
	addService (services) {
		if (this.state === Dealer.State.DYING || this.state === Dealer.State.DIED) return;

		if (this.#services === 'all') return;
		else if (services === 'all') {
			this.#services.clear();
			this.#services = 'all';
		}
		else if (String.is(services)) this.#services.add(services);
		else if (Array.is(services)) services.forEach(s => this.#services.add(s));
		else if (services instanceof Set) {
			for (let s of services) this.#services.add(s);
		}
	}
	removeService (service) {
		if (this.state === Dealer.State.DYING || this.state === Dealer.State.DIED) return;

		if (this.#services === 'all') return;
		this.#services.delete(service);
	}
	resetServices () {
		if (this.state === Dealer.State.DYING || this.state === Dealer.State.DIED) return;

		if (this.#services instanceof Set) {
			this.#services.clear();
		}
		else {
			this.#services = new Set();
		}
	}
	matchService (service) {
		if (this.state === Dealer.State.DYING || this.state === Dealer.State.DIED) return false;

		// 如果对方注册的服务是所有服务，则返回所有可用连接
		if (this.#services === 'all') return true;

		return this.#services.has(service);
	}
	pickConn (url) {
		var list = [];

		this.#pool.forEach(conn => {
			if (!conn.connected) return;

			if (conn.name === 'local') {
				if (!isDelegator) list.push(conn);
				return;
			}

			// 如果filter为空，表示转发所有服务
			if (conn.filter.size === 0) {
				list.push(conn);
				return;
			}

			var ok = false;
			for (let f of conn.filter) {
				if (!!url && url.indexOf(f) !== 0) continue;
				ok = true;
				break;
			}
			if (ok) list.push(conn);
		});
		return list;
	}
	suicide () {
		var task = 2;
		var cb = () => {
			task --;
			if (task > 0) return;

			this.name = '';
			if (this.#services instanceof Set) this.#services.clear();
			this.#services = undefined;
			this.#pool = undefined;
		};
		this.#pool.onDied(cb);
		this.onDied(cb);
		this.#pool.suicide();
		super.suicide();
	}
	resetConnInfo () {
		this.#availableConnCount = -1;
	}
	get services () {
		if (this.state === DealerPool.State.DYING || this.state === DealerPool.State.DIED) return null;
		if (this.#services instanceof Set) return [...this.#services];
		return 'all';
	}
	get count () {
		return this.#pool.count;
	}
	get availableCount () {
		if (this.#availableConnCount >= 0) return this.#availableConnCount;
		var count = 0;
		this.#pool.forEach(conn => {
			if (conn.isEmpty || !conn.connected) return;
			count ++;
		});
		this.#availableConnCount = count;
		return count;
	}
	get connList () {
		return this.#pool.memberList;
	}
	static Limit = 10;
	static Initial = 10;
}
class UserPool extends DealerPool {
	waitingConns = [];
	fastIPs = new LRUCache(20);
	#availableConnCount = -1;
	constructor () {
		super(UserNode);
		this.state = DealerPool.State.READY;
	}
	addConn (name, conn) {
		if (!conn) {
			conn = name;
			name = null;
		}
		if (!name) this.waitingConns.push(conn);
		else {
			let mem = this.waitingConns.filter(c => c.name === conn.name);
			if (mem.length > 0) {
				mem.forEach(m => this.waitingConns.remove(m));
			}
			mem = null;
			this.forEach(m => {
				if (m.name !== name) return;
				mem = m;
			});
			if (!mem) {
				mem = new UserNode(name);
				this.addMember(mem);
			}
			mem.addConn(conn);
		}
		this.#availableConnCount = -1;
		this.fastIPs.clear();
	}
	removeConn (conn) {
		var deleted = 0;
		var target = this.waitingConns.filter(c => {
			if (c.fullname.indexOf(conn.fullname) === 0) {
				deleted ++;
				return true;
			}
		});
		target.forEach(c => this.waitingConns.remove(c));

		this.forEach(m => {
			deleted += m.removeConn(conn);
		});
		this.#availableConnCount = -1;
		this.fastIPs.clear();
		return deleted;
	}
	pickConn (url) {
		var list = [];
		if (!url) return null;

		var parts = url.split('/').filter(f => !!f && f.length > 0);
		if (parts.length === 0) return null;

		var service = parts[0];
		var users = [], noMatch = true;

		// 选择自称可提供指定服务的节点
		this.forEach(user => {
			if (user.isDelegator) return;
			if (user.matchService(service)) {
				noMatch = false;
				if (user.available) users.push(user);
			}
		});
		if (users.length === 0) return noMatch;

		// 将所有可提供服务节点的所有可接受服务的连接都筛出来
		url = parts.join('/');
		noMatch = true;
		users.forEach(user => {
			var conns = user.pickConn(url);
			conns.forEach(conn => {
				noMatch = false;
				if (conn.available) list.push([user, conn, user.power + conn.power]);
			});
		});
		if (list.length === 0) return noMatch;

		list.sort((c1, c2) => c1[2] - c2[2]);
		return list[0];
	}
	getUser (name) {
		var user = null;
		this.forEach(u => {
			if (!!user) return;
			if (u.name === name) user = u;
		});
		return user;
	}
	shakehand (ip) {
		this.waitingConns.forEach(conn => {
			if (conn.connected) return;
			if (!!ip && conn.host !== ip) return;
			connectNode(conn);
		});
		this.forEach(mem => {
			mem.forEach(conn => {
				if (conn.connected) return;
				if (!!ip && conn.host !== ip) return;
				connectNode(conn);
			});
		});
	}
	hasHost (host) {
		var has = this.waitingConns.some(conn => conn.host === host);
		if (has) return true;
		this.forEach(node => {
			if (has) return;
			node.forEach(conn => {
				if (has || (conn.host !== host)) return;
				has = true;
			});
		});
		return has;
	}
	resetConnInfo () {
		this.#availableConnCount = -1;
	}
	get availableCount () {
		if (this.#availableConnCount >= 0) return this.#availableConnCount;
		var count = 0;
		this.forEach(user => {
			if (user.name === 'local') return;
			count += user.availableCount;
		});
		this.#availableConnCount = count;
		return count;
	}
}
const UserManager = new UserPool();

const setConfig = async (cfg, callback) => {
	ResponsorManager = require('./responser'); // 不可先加载，因为那次该模块还没初始化完毕
	if (!callback) callback = () => {};

	Config.prefix = cfg.api.url;
	if (!!cfg.api?.services) {
		Config.services.push(...cfg.api.services);
	}
	if (Number.is(cfg.concurrence)) {
		RichAddress.Limit = cfg.concurrence;
		UserNode.Limit = cfg.concurrence;
	}
	else if (Number.is(cfg.concurrence?.cluster)) {
		RichAddress.Limit = cfg.concurrence.cluster;
		UserNode.Limit = cfg.concurrence.cluster;
	}
	if (Number.is(cfg.timeout)) {
		Config.timeout = cfg.timeout;
	}
	else if (Number.is(cfg.timeout?.cluster)) {
		Config.timeout = cfg.timeout.cluster;
	}
	ResponsorManager.load(Path.join(__dirname, 'insider'), false);

	if (isSlaver) return callback();
	if (!cfg.node || !cfg.node.length || cfg.node.length <= 0) return callback();

	var nodes = {};
	cfg.node.forEach(node => {
		var temp = RichAddress.parse(node);
		if (!temp) return;
		var info = nodes[temp.name];
		if (!!info) {
			temp.filter.forEach(f => {
				if (info.filter.has(f)) return;
				info.filter.add(f);
			});
		}
		else {
			nodes[temp.name] = temp;
		}
	});
	for (let tag in nodes) {
		UserManager.waitingConns.push(nodes[tag]);
	}
	var local = new UserNode('local');
	local.addService('all');
	var conn = new RichAddress('http', 'local', 0);
	conn.connected = true;
	local.addConn(conn);
	UserManager.addMember(local);
	UserManager.localUser = local;
	UserManager.localConn = conn;

	TimerShaking = setInterval(() => {
		UserManager.shakehand();
	}, ReshakeInterval);

	callback();
};

const reshakehand = ip => {
	var timer = Reshakings.get(ip);
	if (!!timer) {
		clearTimeout(timer);
		timer = null;
	}
	Reshakings.set(ip, setTimeout(() => {
		Reshakings.delete(ip);
		UserManager.shakehand(ip);
	}, 1000));
};
const checkIP = ip => {
	var has = UserManager.fastIPs.get(ip);
	if (has !== undefined) return has;
	if (ip === '0.0.0.0' || ip === '::' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1' || ip === '::1') {
		UserManager.fastIPs.set(ip, true);
		return true;
	}
	var oip = ip;
	var reg = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	if (!!reg) ip = reg[1];
	has = UserManager.hasHost(ip);
	UserManager.fastIPs.set(oip, has);
	return has;
}
const checkService = url => {
	if (!Config.services || Config.services.length === 0) return true;
	var has = Config.fastServices.get(url);
	if (has !== undefined) return has;
	var service = url.split('/').filter(f => f.trim().length > 0)[0];
	if (!service) has = false;
	else has = Config.services.includes(service);
	Config.fastServices.set(url, has);
	return has;
};
const launchTask = (responsor, param, query, url, data, method, source, ip, port, callback) => new Promise(async res => {
	var sender = (!!param.originSource || !!param.originHost + !!param.originPort)
		? (param.originSource + '/' + param.originHost + '/' + param.originPort)
		: (source + '/' + ip + '/' + port), sendInfo = method + ':' + url;

	var conn = UserManager.pickConn(url);
	if (conn === true) {
		// 如果没有任何一个链接能匹配该请求，则本地处理
		if (isDelegator) {
			let err = new Errors.GalanetError.EmptyClustor();
			let result = {
				ok: false,
				code: err.code,
				message: err.message
			};
			Logger.error('网关无可用节点响应请求！');
			if (!!callback) callback(result);
			return res(result);
		}
		else {
			conn = [UserManager.localUser, UserManager.localConn];
		}
	}
	else if (conn === false) {
		// 如果有链接能匹配该请求但当前不可用，则添加到等待池
		let cb = result => {
			if (!!callback) callback(result);
			res(result);
		};

		Logger.log("请求" + sender + '/' + sendInfo + '入池等待。 Q: ' + JSON.stringify(query) + '; P: ' + JSON.stringify(param));
		Pending.push([responsor, param, query, url, data, method, source, ip, port, cb]);
		return;
	}
	else if (conn === null) {
		Logger.warn("请求路径" + sendInfo + '不合法');
		let err = new Errors.GalanetError.WrongQuestPath('请求路径：' + url);
		let result = {
			ok: false,
			code: err.code,
			message: err.message
		};
		if (!!callback) callback(result);
		return res(result);
	}

	var node, result, task = {};
	[node, conn] = conn;

	// 记录开始信息
	node.start(task);
	conn.start(task);

	// 处理请求：本地转发给业务进程，远端则进行通讯发送请求
	if (node === UserManager.localUser) {
		if (isDelegator) {
			let err = new Errors.GalanetError.QuestDelegator('来自：' + sender);
			result = {
				ok: false,
				code: err.code,
				message: err.message
			};
		}
		else {
			result = await ResponsorManager.launchLocally(responsor, param, query, url, data, method, source, ip, port);
		}
	}
	else {
		Logger.log("请求" + sender + '/' + sendInfo + '被转发至' + conn.name + '。 Q: ' + JSON.stringify(query) + '; P: ' + JSON.stringify(param));

		param = param || {};
		param.isGalanet = true;
		param.originHost = ip;
		param.originPort = port;
		param.originSource = source;
		result = await sendRequest(conn, method, url, param);
	}
	if (!result) {
		let err = new Errors.RuntimeError.EmptyResponse('业务请求: ' + sendInfo + '; 请求者: ' + sender);
		result = {
			ok: false,
			code: err.code,
			message: err.message
		};
	}

	// 记录请求结果
	node.finish(task, result.ok);
	conn.finish(task, result.ok);

	// 处理返回结果
	if (!result.ok) {
		if (result.code === Errors.GalanetError.NotFriendNode.code) {
			Logger.error(conn.name + ' : 本机不在目标友机集群序列中');
			conn.connFail ++;
			if (conn.connFail > 3) {
				UserManager.resetConnInfo();
				node.resetConnInfo();
				conn.connected = false;
			}
			await waitLoop();
			result = await launchTask(responsor, param, query, url, data, method, source, ip, port);
		}
		else if (result.code === Errors.GalanetError.CannotService.code) {
			Logger.error(conn.name + ' : 目标友机不再支持该服务 (' + url + ')');
			let service = url.split('/').filter(u => u.length > 0)[0];
			if (!!service && (node.services !== 'all')) node.removeService(service);
			await waitLoop();
			result = await launchTask(responsor, param, query, url, data, method, source, ip, port);
		}
		else if (result.code === Errors.GalanetError.QuestDelegator.code) {
			Logger.error(conn.name + ' : 目标友机是网关机');
			node.isDelegator = true;
			await waitLoop();
			result = await launchTask(responsor, param, query, url, data, method, source, ip, port);
		}
		else if (result.code === Errors.GalanetError.RequestTimeout.code) {
			Logger.error('请求响应超时: ' + result.message);
			conn.connFail ++;
			if (conn.connFail > 3) {
				UserManager.resetConnInfo();
				node.resetConnInfo();
				conn.connected = false;
			}
			await waitLoop();
			result = await launchTask(responsor, param, query, url, data, method, source, ip, port);
		}
		else if (result.code === "ETIMEDOUT" || result.code === 'ECONNREFUSED' || result.code === Errors.ServerError.ConnectRemoteFailed.code) {
			Logger.error(conn.name + ' : 目标友机疑似离线');
			conn.connFail = 3;
			UserManager.resetConnInfo();
			node.resetConnInfo();
			conn.connected = false;
			await waitLoop();
			result = await launchTask(responsor, param, query, url, data, method, source, ip, port);
		}
		else {
			Logger.error(conn.name + ' error(' + result.code + '): ' + result.message);
		}
	}
	else {
		conn.connFail = 0;
	}

	if (!!callback) callback(result);
	res(result);

	var task = Pending.shift();
	if (!!task) {
		Logger.log("重发池中请求" + sender + '/' + sendInfo + '。 Q: ' + JSON.stringify(query) + '; P: ' + JSON.stringify(param));
		launchTask(...task);
	}
});
const getUsage = () => {
	var result = {};
	result.pending = Pending.length;
	result.nodes = [];
	UserManager.forEach(user => {
		var info = {
			node: user.name,
			services: user.services,
			power: user.power,
			taskInfo: {
				total: user.total,
				done: user.done,
				working: user.working,
				failed: user.failed
			},
			conns: []
		};
		user.forEach(conn => {
			if (conn.isEmpty) return;
			var i = {
				name: conn.name,
				connected: conn.connected,
				available: conn.available,
				connFailed: conn.connFail,
				power: conn.power,
				filter: [...conn.filter],
				taskInfo: {
					total: conn.total,
					done: conn.done,
					working: conn.working,
					failed: conn.failed
				}
			};
			info.conns.push(i);
		});
		result.nodes.push(info);
	});
	result.waitingConns = UserManager.waitingConns.map(conn => conn.fullname);
	return result;
};

const httpClient = (host, port, method, path, param, callback) => new Promise(res => {
	var cfg = {
		method,
		url: 'http://' + host + ':' + port + path
	};
	if (!!param) cfg.data = param;
	Axios.request(cfg).then(result => {
		if (!!callback) callback(result.data);
		res([result.data]);
	}).catch(err => {
		if (!!callback) callback(null, err);
		res([null, err]);
	});
});

const addNode = async node => {
	var conn = RichAddress.parse(node);
	if (!conn || conn.isEmpty) {
		return [null, new Errors.GalanetError.UnavailableNodeAddress()];
	}

	UserManager.addConn(conn);
	UserManager.shakehand();

	return ['已成功添加节点'];
};
const removeNode = node => {
	var conn = RichAddress.parse(node);
	if (!conn || conn.isEmpty) {
		return [null, new Errors.GalanetError.UnavailableNodeAddress()];
	}

	var count = UserManager.removeConn(conn);
	if (count === 0) {
		return [null, new Errors.GalanetError.NoSuchNode(info.name)];
	}
	else {
		return ['共删除 ' + count + ' 个节点'];
	}
};

const getNodeInfo = () => {
	return global.PersonCard.toString();
};
const shutdown = all => new Promise(async res => {
	clearInterval(TimerShaking);
	if (!all) return res(0);

	var list = [];
	UserManager.forEach(user => {
		if (user.name === 'local') return;
		user.forEach(conn => {
			if (!conn.connected || conn.isEmpty) return;
			list.push(conn);
		});
	});
	if (list.length === 0) return res(0);

	await Promise.all(list.map(async conn => {
		try {
			await sendRequest(conn, 'put', '/galanet/shutdown');
		}
		catch (err) {
			Logger.warn("通知集群友机关闭出错：" + err.message);
		}
	}));
	res(list.length);
});

const MainProcessTasks = new Map();
const sendToMainProcess = (event, id, data) => new Promise(res => {
	var reses = MainProcessTasks.get(id);
	if (!reses) {
		reses = [];
		MainProcessTasks.set(id, reses);
	}
	reses.push(res);
	process.send({event, id, data});
});
const sendRequest = (node, method, path, message) => new Promise(res => {
	var finished = false;
	var cb = (result, err) => {
		if (finished) return;
		finished = true;
		if (!!timer) {
			clearTimeout(timer);
			timer = null;
		}
		if (!!err) {
			result = {
				ok: false,
				code: err.code || 500,
				message: err.message
			};
		}
		res(result);
	}
	var timer = setTimeout(() => {
		var sendInfo = method + ':' + path;
		cb(null, new Errors.GalanetError.RequestTimeout('转发目标: ' + node.name + '; 请求: ' + sendInfo));
	}, Config.timeout);

	if (node.protocol === 'http') {
		httpClient(node.host, node.port, method, Config.prefix + path, message, cb);
	}
	else {
		let data = {
			action: method || 'get',
			event: path,
			data: message
		};
		if (node.protocol === 'tcp') {
			TCP.client(node.host, node.port, data, cb);
		}
		else if (node.protocol === 'udp') {
			UDP.client(node.host, node.port, data, cb);
		}
		else {
			cb(null, new Errors.GalanetError.WrongProtocol('错误的请求协议：' + node.protocol));
		}
	}
});
const broadcast = async (msg, toAll, mid) => {
	if (global.isSlaver) {
		return await sendToMainProcess('broadcast', mid, { toAll, msg });
	}

	mid = mid || newLongID();
	MsgBus.addMsgRecord(mid);

	var count = 0, task = 0, list = [];
	UserManager.forEach(user => {
		if (user.name === 'local') return;
		var conns = [];
		user.pickConn().forEach(conn => {
			if (!conn.connected) return;
			conns.push(conn);
		});
		if (conns.length === 0) return;
		conns.sort((c1, c2) => c1.energy - c2.energy);
		list.push(conns[0]);
	});
	task = list.length;
	await Promise.all(list.map(async conn => {
		await sendRequest(conn, 'post', '/galanet/message', { type: 'broadcast', mid, toAll, data: msg });
		count ++;
	}));
	return [count, task];
};
const narrowcast = async (msg, count, mid) => {
	if (global.isSlaver) {
		return await sendToMainProcess('narrowcast', mid, { count, msg });
	}

	mid = mid || newLongID();
	MsgBus.addMsgRecord(mid);

	var task = 0, list = [];
	UserManager.forEach(user => {
		if (user.name === 'local') return;

		var conns = [];
		user.pickConn().forEach(conn => {
			if (!conn.connected) return;
			conns.push(conn);
		});
		if (conns.length === 0) return;
		conns.sort((c1, c2) => c1.energy - c2.energy);
		list.push(conns[0]);
	});

	if (count > list.length) count = list.length;
	list.randomize();
	list = list.splice(0, count);

	task = list.length;
	count = 0;
	await Promise.all(list.map(async conn => {
		await sendRequest(conn, 'post', '/galanet/message', { type: 'narrowcast', mid, count, data: msg });
		count ++;
	}));
	return [count, task];
};
const sendTo = async (target, msg, mid) => {
	if (global.isSlaver) {
		return await sendToMainProcess('directcast', mid, { target, msg });
	}

	mid = mid || newLongID();
	MsgBus.addMsgRecord(mid);

	var task = 0, conn = null, found = false;
	UserManager.forEach(user => {
		if (found) return;
		if (user.name === 'local') return;
		if (user.name !== target) return;
		found = true;

		var conns = [];
		user.pickConn().forEach(conn => {
			if (!conn.connected) return;
			conns.push(conn);
		});
		if (conns.length === 0) return;
		conns.sort((c1, c2) => c1.energy - c2.energy);
		conn = conns[0];
	});

	var count = found ? 1 : 0;
	var done = !!conn ? 1 : 0;

	if (done === 0) return [done, count];

	await sendRequest(conn, 'post', '/galanet/message', { type: 'directcast', mid, data: msg });
	return [done, count];
};
const castDone = (mid, success, total) => {
	var reses = MainProcessTasks.get(mid);
	if (!reses) return;
	var list = reses.copy();
	reses.clear();
	MainProcessTasks.delete(mid);
	for (let res of list) {
		res([success, total]);
	}
};
const sendMessage = async (msg, option) => {
	console.log(msg, option);
};

const connectNode = node => new Promise(res => {
	var connect;
	if (node.protocol === 'http') {
		connect = connectHTTP;
	}
	else if (node.protocol === 'tcp') {
		connect = connectTCP;
	}
	else if (node.protocol === 'udp') {
		connect = connectUDP;
	}
	else {
		Logger.warn('错误的节点协议: ', node.name);
		return res(new Errors.GalanetError.WrongProtocol());
	}
	connect(node, (data, err) => {
		if (!!err) {
			Logger.warn('与节点 ' + node.name + ' 握手失败: ' + err.message);
			node.available = false;
			return res(err);
		}
		node.available = true;

		var info;
		try {
			info = Shakehand.fromString(data);
		}
		catch (err) {
			Logger.warn('获取握手数据解析错误：' + err.message);
			return res();
		}
		if (!info) return res();
		info = info[0];
		if (!info) return res();

		var check = false;
		try {
			check = Personel.check(info.pubkey, info.id);
		}
		catch (err) {
			Logger.warn('验证握手数据错误：' + err.message);
			return res();
		}
		if (!check) return res();

		node.connected = true;
		node.failed = 0;
		node.connFail = 0;
		node.power = RichAddress.Initial;
		node.energy = RichAddress.Initial;
		UserManager.addConn(info.id, node);

		var user = UserManager.getUser(info.id);
		if (!info.services || info.services.length === 0) user.addService('all');
		else user.addService(info.services);
		user.pubkey = info.pubkey;
		user.isDelegator = !!info.delegator;
		UserManager.resetConnInfo();
		user.resetConnInfo();
		Logger.info('连接' + node.name + '成功！');
		res();
	});
});
const connectHTTP = async (node, callback) => {
	var [reply, err] = await httpClient(node.host, node.port, 'get', Config.prefix + '/galanet/shakehand', null);
	if (!!err) {
		if (!!callback) callback(null, err);
		return [null, err];
	}
	else if (reply.ok) {
		if (!!callback) callback(reply.data);
		return [reply.data];
	}
	else {
		err = new Errors.GalanetError.ShakehandFailed(reply.message);
		if (!!callback) callback(null, err);
		return [null, err];
	}
};
const connectTCP = async (node, callback) => {
	var message = { event: '/galanet/shakehand', data: '' };
	try {
		var [reply, err] = await TCP.client(node.host, node.port, message);
		if (!!err) {
			callback(null, err);
		}
		else {
			if (reply.ok) callback(reply.data);
			else callback(null, new Errors.GalanetError.ShakehandFailed(reply.message))
		}
	}
	catch (err) {
		// callback(null, err);
	}
};
const connectUDP = async (node, callback) => {
	var message = { event: '/galanet/shakehand', data: '' };
	try {
		var [reply, err] = await UDP.client(node.host, node.port, message);
		if (!!err) {
			callback(null, err);
		}
		else {
			if (reply.ok) callback(reply.data);
			else callback(null, new Errors.GalanetError.ShakehandFailed(reply.message))
		}
	}
	catch (err) {
		callback(null, err);
	}
};

module.exports = {
	setConfig,
	addNode,
	removeNode,
	shakehand: ip => UserManager.shakehand(ip),
	reshakehand,
	check: checkIP,
	checkService,
	launch: launchTask,
	sendMessage,
	broadcast,
	narrowcast,
	sendTo,
	castDone,
	getUsage,
	getNodeInfo,
	getFriends: () => UserManager.memberList,
	shutdown,
	get availableServices () {
		return Config.services;
	},
	get isInGroup () {
		return UserManager.availableCount > 0;
	}
};
_('Core.Galanet', module.exports);