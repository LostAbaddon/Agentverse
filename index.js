const server = require('./server.js').server;
const socket = require('./server.js').console;
const AI = require('./ai');

const config = require('./config.json');

const startDeamon = () => new Promise(res => {
	const ConsoleEventTag = require('./server/console').ConsoleEventTag;

	AI.events.forEach(event => {
		process.on(ConsoleEventTag + event, async (data, evt, callback) => {
			let [reply, err] = await AI.call(event, data);
			callback(reply, err);
		});
	});

	server(config)
	.onStart((core, param, config) => {
		if (!!param.daemon) {
			if (Number.is(config.backend.port)) {
				config.port = config.port || {};
				config.port.http = config.backend.port;
				if (Number.is(config.backend.secure)) config.port.https = config.backend.secure;
			}
			else if (!!config.backend.port) {
				config.port = config.port || {};
				if (Number.is(config.backend.port.http)) config.port.http = config.backend.port.http;
				if (Number.is(config.backend.port.https)) config.port.https = config.backend.port.https;
			}
			if (Number.is(config.backend.tcp)) config.port.tcp = config.backend.tcp;
			if (String.is(config.backend.pipe)) config.port.pipe = config.backend.pipe;
			if (Number.is(config.backend.udp4)) config.port.udp4 = config.backend.udp4;
			if (Number.is(config.backend.udp6)) config.port.udp6 = config.backend.udp6;
			if (Boolean.is(config.backend.console) || String.is(config.backend.console)) config.console = config.backend.console;
		}
	})
	.onReady(async (core, param, config) => {
		console.log('System Initialized.');
		core.responsor.broadcast(null, 'init');
		res();
	})
	.launch();
});
const connectConsole = () => {
	var target = config.backend.console;
	if (!!target) {
		config.ipc = config.backend.console;
		let skt = socket(config)
		.add('ask')
		.setParam('<data>')
		.add('task')
		.setParam('<data>')
		.on("command", async (param, socket) => {
			var quests = [];
			var tasks = param.mission;
			for (let task of tasks) {
				let quest = {};
				quest.name = task.name;
				quest.event = task.name;
				quest.data = task.value;
				quests.push(quest);
			}
			var [result, err] = await socket.sendRequest(quests);
			if (!!err && err.errno === -4058) {
				[result, err] = await dealSingletonEvent(quests);
			}

			if (!!err) {
				console.error(err.message || err.msg || err);
			}
			else {
				for (let evt in result) {
					let rst = result[evt];
					if (rst.ok) {
						AI.show(evt, rst.data);
					}
					else {
						AI.show(evt, null, rst.message);
					}
				}
			}
		})
		.launch();
	}
};
const dealSingletonEvent = async tasks => {
	var result = {};
	await Promise.all(tasks.map(async task => {
		if (AI.events.includes(task.event)) {
			let [reply, err] = await AI.call(task.event, task.data);
			if (!!err) {
				let e = { ok: false };
				Object.assign(e, err);
				result[task.name] = e;
			}
			else {
				result[task.name] = {
					ok: true,
					data: reply
				};
			}
		}
		else {
			result[task.name] = {
				ok: false,
				code: 404,
				message: '无指令响应模块'
			};
		}
	}));
	return [result];
};

const init = async () => {
	var args = [].map.call(process.argv, a => a);
	args.shift();
	args.shift();
	args = args.join(' ');
	if (args.indexOf('--daemon') >= 0) {
		await startDeamon();
	}
	else {
		await connectConsole();
	}
};

init();