const SocksProxyAgent = require('socks-proxy-agent');

const server = require('./server.js').server;
const socket = require('./server.js').console;
const AI = require('./ai');
const Agents = require("./ai/agents.js");

const Logger = _("Utils.Logger");
const logger = new Logger('Center');
const config = require('./config.json');

global.isSingleton = false;

const prepareAI = async (param, config) => {
	var aiType = param.agent || config.agent;
	if (!Agents.Agents[aiType]) {
		aiType = config.agent;
		if (!Agents.Agents[aiType]) {
			aiType = Object.keys(Agents.Agents)[0];
		}
	}
	var cfg = config.setting[aiType];
	cfg.retry = config.setting.retry;
	await AI.init({type: aiType, config: cfg});
	if (!!config.proxy) {
		try {
			global.globalHTTPSProxy = new SocksProxyAgent.SocksProxyAgent(config.proxy);
			global.globalHTTPSProxy.keepAlive = true;
			global.globalHTTPSProxy.keepAliveMsecs = 1000;
			global.globalHTTPSProxy.scheduling = 'lifo';
			global.globalHTTPSProxy.options = {
				keepAlive: true,
				scheduling: 'lifo',
				timeout: 5000,
				noDelay: true
			};
		}
		catch {
			global.globalHTTPSProxy = null;
		}
	}
};

const startDeamon = () => new Promise(res => {
	const ConsoleEventTag = require('./server/console').ConsoleEventTag;

	AI.events.forEach(event => {
		process.on(ConsoleEventTag + event, async (data, evt, callback) => {
			var [reply, err] = await AI.call(event, data);
			callback(reply, err);
		});
	});

	server(config)
	.onStart(async (core, param, config) => {
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
		await prepareAI(param, config);
		logger.log('System Initialized.');
		core.responsor.broadcast(null, 'init');
		res();
	})
	.launch();
});
const connectConsole = () => {
	var target = config.backend.console;
	if (!!target) {
		config.ipc = config.backend.console;
		Logger.setOutput(config.config.log.output);

		let skt = socket(config)
		.addOption("--agent -a <agent> >> AI type")
		.add('ask')
		.setParam('<data>')
		.addOption("--new -n >> New session")
		.addOption("--knowledge -k <knowledge> >> Set knowledge")
		.add('task')
		.setParam('<data>')
		.addOption("--knowledge -k <knowledge> >> Set knowledge")
		.addOption("--max -m <max> >> Max execution times")
		.on("command", async (param, socket) => {
			var quests = [];
			var tasks = param.mission;
			for (let task of tasks) {
				let quest = {};
				quest.name = task.name;
				quest.event = task.name;
				quest.data = task.value;
				quests.push(quest);
				AI.show('send', task.name, task.value.data);
			}

			AI.show('waiting');

			var [result, err] = await socket.sendRequest(quests);
			if (!!err && err.errno === -4058) {
				global.isSingleton = true;
				await prepareAI(param, config);

				[result, err] = await dealSingletonEvent(quests);
			}

			if (!!err) {
				if (isSingleton) console.error(err);
				else logger.error(err.message || err.msg || err);
			}
			else {
				for (let evt in result) {
					let rst = result[evt];
					if (rst.ok) {
						AI.show('reply', evt, rst.data);
					}
					else {
						AI.show('reply', evt, null, rst.message);
					}
				}

				AI.show('leaving');
				await wait(1000);
				process.exit();
			}
		})
		.launch();
	}
};
const dealSingletonEvent = async tasks => {
	var result = {};
	await Promise.all(tasks.map(async task => {
		if (AI.events.includes(task.event)) {
			task.data.data = task.data.data.replace(/(\\+)n/gi, (match, pre) => {
				if (pre.length >> 1 << 1 === pre.length) return match;
				return '\n';
			});
			let [reply, err] = await AI.call(task.event, task.data);
			if (!!err) {
				let e = { ok: false };
				e.message = err.message || e.msg || err.toString();
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