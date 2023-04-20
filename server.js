global.noEventModules = true;

const Path = require('path');
require("./core");
loadall(__dirname, "./core/datastore");
loadall(__dirname, "./core/commandline");
loadall(__dirname, "./kernel", false);
require('./server/center');
const webServer = require('./server/web');
const socketServer = require('./server/socket');
const consoleServer = require('./server/console');
const ResponsorManager = require('./server/responser');
const CLP = _('CL.CLP');
const setStyle = _('CL.SetStyle');
const DefailtIPC = '/tmp/console.ipc';

global.ProcessStat = Symbol.set('IDLE', 'INIT', 'READY', 'DEAD');
global.processStat = global.ProcessStat.IDLE;

const createServer = (config, options) => {
	global.processStat = global.ProcessStat.INIT;

	var hooks = {
		start: [],
		ready: []
	};

	// 配置命令行工具
	const clp = CLP({
		mode: 'process',
		title: config.name + " v" + config.version,
	}).describe(setStyle(config.name + " v" + config.version, "bold"))
	.addOption('--config -c <config> >> 指定配置文件')
	.addOption('--daemon [daemon] >> 启用后台值守模式')
	.addOption('--logLevel [logLevel=0] >> 日志输出等级')
	.addOption('--logFile <logFile> >> 日志输出目录')
	.addOption('--silence >> 不显示控制台日志');

	if (Array.is(options)) options.forEach(opt => clp.addOption(opt));

	clp.on('command', async (param, command) => {
		var cfg = param.config || config.cfgPath || './config.json';
		if (!!cfg) {
			if (cfg.substr(0, 1) === '.') {
				cfg = Path.join(process.cwd(), cfg);
			}
			try {
				cfg = require(cfg);
				if (!!config.config) cfg = Object.assign(config.config.duplicate(), cfg);
			}
			catch (err) {
				if (!!config.config) cfg = config.config.duplicate();
				else cfg = { port: {} };
			}
		}
		else if (!!config.config) {
			cfg = config.config.duplicate();
		}
		else {
			cfg = { port: {} };
		}
		if (Number.is(param.process) || param.process === 'auto') cfg.process = param.process;
		if (Number.is(param.concurrence)) cfg.concurrence = param.concurrence;
		cfg.log = cfg.log || {};
		if (Number.is(param.logLevel)) cfg.log.level = param.logLevel;
		else cfg.log.level = 0;
		if (String.is(param.logFile)) cfg.log.output = param.logFile;
		if (Boolean.is(param.silence)) cfg.log.silence = param.silence;
		else if (!Boolean.is(cfg.log.silence)) cfg.log.silence = false;

		const Core = {
			responsor: ResponsorManager,
			galanet: require('./server/galanet')
		};
		if (hooks.start.length > 0) hooks.start.forEach(cb => cb(Core, param, cfg));
		delete hooks.start;

		// 设置日志相关
		var Logger = _("Utils.Logger");
		var logger = new Logger('Entrance');
		Logger.LogLimit = cfg.log.level;
		Logger.Silence = cfg.log.silence;

		// Load Responsors
		if (!cfg.api) {
			global.processStat = global.ProcessStat.DEAD;
			let err = new Errors.ConfigError.NoResponsor();
			logger.error(err.message);
			if (!!config.welcome?.failed) logger.error(config.welcome.failed);
			process.exit();
			return;
		}
		if (!!cfg.api.local) {
			cfg.isDelegator = false;
			ResponsorManager.load(Path.join(process.cwd(), cfg.api.local));
		}
		else {
			cfg.isDelegator = true;
		}

		global.localIPs = _('Utils.getLocalIP')();

		var tasks = {}, count = 0, success = 0;
		var cb = (task, ok) => {
			if (tasks[task]) return;
			tasks[task] = true;
			count --;
			if (ok) success ++;
			if (count !== 0) return;
			if (success === 0) {
				global.processStat = global.ProcessStat.DEAD;
				if (!!config.welcome?.failed) logger.error(config.welcome.failed);
				process.exit();
				return;
			}
			ResponsorManager.setConfig(cfg, async () => {
				Logger.setOutput(cfg.log.output);

				if (!global.isMultiProcess) {
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
				}

				var list = hooks.ready.copy();
				delete hooks.ready;
				await Promise.all(list.map(async cb => await cb(Core, param, cfg)));

				global.processStat = global.ProcessStat.READY;
				if (!!config.welcome?.success) logger.log(config.welcome.success);
			});
		};

		// 启动 Web 服务器
		count ++;
		tasks.web = false;
		webServer(cfg, async error => {
			await wait();
			if (error instanceof Error) {
				logger.error('Launch Web-Server Failed: ' + error.message);
				cb('web', false);
			}
			else {
				cb('web', true);
			}
		});

		// 启动 TCP / UDP 服务器
		if (!!cfg.port && (!!cfg.port.tcp || !!cfg.port.pipe || !!cfg.port.udp4 || !!cfg.port.udp6)) {
			count ++;
			tasks.socket = false;
			socketServer(cfg, async error => {
				await wait();
				if (error instanceof Error) {
					logger.error('Launch Socket-Server Failed.');
					cb('socket', false);
				}
				else {
					cb('socket', true);
				}
			});
		}

		// 启动控制台
		if (!!cfg.console) {
			count ++;
			tasks.console = false;
			let ipc = cfg.console;
			if (!String.is(ipc)) ipc = DefailtIPC;
			consoleServer.create(clp, ipc, async err => {
				await wait();
				if (err instanceof Error) {
					logger.error('Launch Console-Server Failed: ' + err.message);
					cb('console', false);
				}
				else {
					cb('console', true);
				}
			});
		}
	});

	clp.onStart = cb => {
		if (Function.is(cb)) hooks.start.push(cb);
		return clp;
	};
	clp.onReady = cb => {
		if (Function.is(cb)) hooks.ready.push(cb);
		return clp;
	};

	return clp;
};
const createConsole = (config, options) => {
	global.processStat = global.ProcessStat.INIT;

	const clp = CLP({
		mode: 'process',
		title: config.name + " v" + config.version,
	}).describe(setStyle(config.name + " v" + config.version, "bold"))

	if (Array.is(options)) options.forEach(opt => clp.addOption(opt));

	clp.on('command', (param, command) => {
		clp.socketPipe = config.ipc;
		global.processStat = global.ProcessStat.READY;
		consoleServer.deal(param, config);
	});

	clp.sendRequest = request => consoleServer.request(clp.socketPipe, request);

	return clp;
};

// 输出
module.exports = {
	server: createServer,
	console: createConsole
};