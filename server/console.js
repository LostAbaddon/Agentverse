const pipeServer = require('../kernel/tcp');
const setStyle = _('CL.SetStyle');
const Logger = new (_("Utils.Logger"))('ConsoleManager');

const ConsoleEventTag = 'console::';
const ConsoleHelp = {
	stat: 'usage\t\t\t查看各子进程负载情况\ncluster\t\t\t查看 Galanet 中友节点\nall\t\t\t查看全部信息',
	local: 'refresh\t\t\t重启业务子进程\nset-process\t\t设置业务进程数\nset-concurrence\t\t设置业务进程请求并发数',
	network: 'friends\t\t\t显示已连接邻点',
};

const sockets = [];

// 服务端
const createServer = (host, ipc, callback) => {
	pipeServer.server(ipc, 0, (svr, err) => {
		if (!!err) {
			Logger.error('Create Console-Server Failed.');
			err = new Errors.ServerError.CreateConsoleFailed(err.message);
			callback(err);
		}
		else {
			svr.on('connection', socket => {
				socket.on('close', (...args) => {
					sockets.remove(socket);
				});
				if (!sockets.includes(socket)) sockets.push(socket);
			});
			host.onConsoleEvent = (event, callback) => onMessage(event, callback);
			host.onceConsoleEvent = (event, callback) => onceMessage(event, callback);
			host.offConsoleEvent = (event, callback) => offMessage(event, callback);
			callback();
		}
	}, (msg, socket, resp) => {
		if (!msg || !Array.is(msg) || msg.length === 0) {
			return resp({
				ok: false,
				code: 404,
				message: "无指令"
			});
		}

		var result = {}, count = 0, tasks = {};
		var events = process.eventNames();
		for (let cmd of msg) {
			if (!events.includes(ConsoleEventTag + cmd.event)) {
				result[cmd.name] = {
					ok: false,
					code: 404,
					message: '无指令响应模块'
				};
				continue;
			}

			tasks[cmd.name] = false;
			count ++;
		}
		for (let cmd of msg) {
			let eventMsg = {
				event: cmd.name,
				pipe: socket,
				cancel: false
			};
			process.emit(ConsoleEventTag + cmd.event, cmd.data, eventMsg, (reply, err) => {
				if (tasks[cmd.name]) return;
				tasks[cmd.name] = true;
				count --;
				if (!!err) {
					result[cmd.name] = {
						ok: false,
						code: err.code,
						message: err.message
					};
				}
				else {
					result[cmd.name] = {
						ok: true,
						data: reply
					};
				}
				if (count === 0) {
					resp(result);
				}
			});
		}
		if (count === 0) {
			resp(result);
		}
	});
};

const onMessage = (event, callback) => {
	process.on(ConsoleEventTag + event, callback);
};
const onceMessage = (event, callback) => {
	process.once(ConsoleEventTag + event, callback);
};
const offMessage = (event, callback) => {
	process.off(ConsoleEventTag + event, callback);
};

const request = (ipc, commands, callback) => new Promise(res => {
	pipeServer.client(ipc, 0, commands, (reply, err) => {
		if (!!callback) callback(reply, err);
		res([reply, err]);
	});
});

// 客户端
const deal = async (param, config) => {
	var cmds = {}, req = [], cmdList = {};
	param.mission.forEach(m => {
		if (m.value?.list) {
			console.log(m.name + ' 可用参数：');
			console.log(ConsoleHelp[m.name] || '(无)');
		}
		else {
			cmds[m.name] = m.value;
		}
	});

	if (!!cmds.stat && !!cmds.stat.item) {
		if (cmds.stat.item === 'all') {
			cmdList.stat = 'all';
			req.push({
				name: 'stat:usage',
				target: 'all:usage',
				event: 'stat::usage',
			});
			req.push({
				name: 'stat:cluster',
				target: 'all:cluster',
				event: 'stat::cluster',
			});
		}
		else {
			cmdList.stat = cmds.stat.item;
			req.push({
				name: 'stat',
				target: cmds.stat.item,
				event: 'stat::' + cmds.stat.item,
			});
		}
	}
	if (!!cmds.local && !!cmds.local.command) {
		cmdList.local = cmds.local.command;
		if (cmds.local.command.includes('refresh')) {
			req.push({
				name: 'local',
				target: cmds.local,
				event: 'local::refresh'
			});
		}
		else if (cmds.local.command.includes('set-concurrence')) {
			req.push({
				name: 'local',
				target: cmds.local,
				event: 'local::set::concurrence',
				data: cmds.local.command[1]
			});
		}
		else if (cmds.local.command.includes('set-process')) {
			req.push({
				name: 'local',
				target: cmds.local,
				event: 'local::set::subprocess',
				data: cmds.local.command[1]
			});
		}
	}
	if (!!cmds.network) {
		let action = null;
		if (cmds.network.add) action = 'addNode';
		else if (cmds.network.remove) action = 'removeNode';
		if (!!action) {
			cmdList.network = action;
			req.push({
				name: 'network',
				target: action,
				event: 'network::' + action,
				data: cmds.network.node
			});
		}
		if (cmds.network.command.includes('friends')) {
			cmdList.network = 'friends';
			req.push({
				name: 'network',
				target: cmds.network,
				event: 'network::show::friends'
			});
		}
	}
	if (!!cmds.shutdown) {
		let isAll = !!cmds.shutdown.all;
		cmdList.shutdown = isAll;
		req.push({
			name: 'shutdown',
			target: 'shutdown',
			event: 'shutdown',
			data: isAll
		});
	}

	if (req.length === 0) return;
	var [reply, err] = await request(config.ipc, req);
	if (!!err) {
		console.error(err.message || err);
	}
	else if (!reply) {
		console.error('空回复');
	}
	else {
		let result = {};
		for (let item in reply) {
			let msg = reply[item];
			if (item === 'stat') {
				if (cmdList.stat === 'usage') showStatUsage(msg);
				else if (cmdList.stat === 'cluster') showStatNetwork(msg);
			}
			else if (item === 'stat:usage') {
				result.stat = result.stat || {};
				result.stat.usage = msg;
				if (!!result.stat.usage && result.stat.cluster) showStatAll(result.stat);
			}
			else if (item === 'stat:cluster') {
				result.stat = result.stat || {};
				result.stat.cluster = msg;
				if (!!result.stat.usage && result.stat.cluster) showStatAll(result.stat);
			}
			else if (item === 'local') {
				if (msg.ok) {
					console.log(msg.data);
				}
				else {
					console.error(msg.message);
				}
			}
			else if (item === 'network') {
				let order = cmdList.network;
				if (order === 'addNode') {
					if (msg.ok) {
						console.log(msg.data);
					}
					else {
						console.error('添加节点失败（错误号 ' + msg.code + '）: ' + msg.message);
					}
				}
				else if (order === 'removeNode') {
					if (msg.ok) {
						console.log(msg.data);
					}
					else {
						console.error('移除节点失败（错误号 ' + msg.code + '）: ' + msg.message);
					}
				}
				else if (order === 'friends') {
					showFriends(msg.data);
				}
				else {
					console.log(order + ':', msg);
				}
			}
			else if (item === 'shutdown') {
				if (msg.ok) {
					console.log(msg.data);
				}
				else {
					console.error('关闭失败（错误号 ' + msg.code + '）：' + msg.message);
				}
			}
			else {
				console.error(item + '/' + cmdList[item] + ': ' + msg.message);
			}
		}
	}
};
const showStatUsage = data => {
	if (data.ok) {
		data = data.data;
		if (!!data.connections) {
			console.log('接入端口：');
			if (!!data.connections.http) console.log('\t\t Http:\t' + data.connections.http);
			if (!!data.connections.https) console.log('\t\tHttps:\t' + data.connections.https);
			if (!!data.connections.tcp) console.log('\t\t  TCP:\t' + data.connections.tcp);
			if (!!data.connections.udp4) console.log('\t\t UDP4:\t' + data.connections.udp4);
			if (!!data.connections.udp6) console.log('\t\t UDP6:\t' + data.connections.udp6);
			if (!!data.connections.pipe) console.log('       PipeSocket路径:\t' + data.connections.pipe);
			console.log('--------------------------------------------------');
		}
		console.log('　　　代理网关：\t' + (data.isDelegator ? '是' : '否'));
		console.log('　　　集群节点：\t' + (data.isInGroup ? '是' : '否'));
		console.log('　　并行进程数：\t' + data.processCount);
		if (Number.is(data.concurrence)) console.log('　　并发任务数：\t' + data.concurrence);
		else console.log('　　并发任务数：\t' + (data.concurrence.cluster || 'auto') + '（节点）    ' + (data.concurrence.local || 'auto') + '（进程/线程）');
		console.log('等待中的任务数：\t' + data.pending);
		data.workers.forEach((worker, i) => {
			let list = [];
			if (worker.alive) {
				list.push(setStyle('进程-' + (i + 1) + ':', 'bold'));
			}
			else {
				list.push(setStyle('进程-' + (i + 1) + '(宕):', 'bold yellow'));
			}
			list.push('　　　任务: ' + worker.done + ' / ' + worker.total);
			list.push('　　总耗时: ' + worker.spent + ' ms\t\t\t\t加权平均耗时: ' + (Math.round(worker.energy * 100) / 100) + ' ms');
			list.push('　负载指数: ' + (Math.round(worker.power * 100) / 100));
			console.log(list.join('\n'));
		});
	}
	else {
		console.error(setStyle(title, 'bold red') + '\n' + setStyle(data.message, 'red') + '\n');
	}
};
const showStatNetwork = data => {
	if (data.ok) {
		data = data.data;
		console.log('等待中的任务数： ' + data.pending);

		console.log('　　可用节点数： ' + data.nodes.length);
		data.nodes.forEach((user, i) => {
			console.log(setStyle('======== 节点-' + (i + 1) + ' ========', 'bold green'));
			console.log('　　　　　　　　ID：' + user.node);
			console.log('　　　　　　优先度：' + (Math.round(user.power * 100) / 100));
			console.log('　　　　　可用服务：' + (!!user.services.join ? user.services.join(', ') : user.services));
			console.log('　　　　　任务情况：' + user.taskInfo.done + ' / ' + user.taskInfo.total + '    失败：' + user.taskInfo.failed);
			console.log('　　　　可用连接数：' + user.conns.length);
			user.conns.forEach(conn => {
				if (conn.connected) {
					console.log(setStyle('　　　　-------- 连接：' + conn.name + ' --------', 'bold yellow'));
				}
				else {
					console.log(setStyle('　　　　-------- 连接：' + conn.name + '（连接已断开） --------', 'bold magenta'));
				}
				console.log('　　　　　　　响应未满：' + (conn.available ? '是' : '否'));
				console.log('　　　　　　　　优先度：' + (Math.round(conn.power * 100) / 100));
				console.log('　　　　　连接失败次数：' + conn.connFailed);
				console.log('　　　　　　可转发类别：' + (conn.filter.length === 0 ? '所有' : conn.filter.join(', ')));
				console.log('　　　　　　　任务情况：' + conn.taskInfo.done + ' / ' + conn.taskInfo.total + '    失败：' + conn.taskInfo.failed);
			});
		});

		console.log(setStyle('待连接节点数： ' + data.waitingConns.length, 'bold red'));
		data.waitingConns.forEach(conn => {
			console.log('    ' + conn);
		});
	}
	else {
		console.error(setStyle(data.message, 'red') + '\n');
	}
};
const showStatAll = data => {
	showStatUsage(data.usage);
	console.log('--------------------------------------------------');
	showStatNetwork(data.cluster);
};
const showFriends = list => {
	for (let user in list) {
		console.log(setStyle('友机ID: ' + user, 'friends'));
		list[user].forEach(conn => {
			console.log('    ' + conn.name + ' (' + (conn.connected ? '已连接' : '未连接') + ')');
		});
	}
};

module.exports = {
	create: createServer,
	on: onMessage,
	once: onceMessage,
	off: offMessage,
	deal,
	request,
	ConsoleEventTag: ConsoleEventTag
};