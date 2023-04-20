/**
 * Name:	Common Core
 * Desc:    辅助工具
 * Author:	LostAbaddon
 * Version:	0.0.4
 * Date:	2019.06.03
 *
 * 热更新require库
 * 字符串拓展、随机穿
 * 日志工具
 * 文件夹生成
 * 辅助工具
 * Object的copy与extent功能
 */

try {
	if (!!window) {
		window.global = window;
		global._env = 'browser';
		global.require = () => {};
	} else {
		global._env = 'node';
	}
} catch (err) {
	global._env = 'node';
}

if (!process.execArgv.includes('--expose-gc')) global.gc = () => {};

require('./namespace.js');
require('./utils/loadall');
require('./extend');
require('./utils/datetime');
require('./utils/logger');

require('./fs/prepare');

if (!global.noEventModules) {
	require('./events/synclock');
	require('./events/eventManager');
	if (global._canThread) {
		require('./events/channel');
		require('./threads/threadManager');
	}
}

require('./moduleManager');