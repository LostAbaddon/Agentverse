/**
 * Name:	System Health Utils
 * Desc:    系统运行状态检查
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2017.10.15
 */

var os = require('os');

const getCPUUsage = (duration, cb) => new Promise((resolve, reject) => {
	var last = process.cpuUsage();
	var start = process.hrtime();
	setTimeout(() => {
		var result = process.cpuUsage(last);
		var end = process.hrtime(start);
		var timespend = end[0] + end[1] / 1000000000; // nanosecond
		var user = result.user / 1000000, sys = result.system / 1000000; // microsecond
		result = {user, sys, total: timespend};
		resolve(result);
		if (!!cb) cb(result);
	}, duration || 1000);
});

var format = num => (Math.round(num * 10000) / 100) + '%';
var getHealth = async (duration, cb) => {
	var mem = process.memoryUsage();
	var cpu = await getCPUUsage(duration);
	var result = {
		cpu: (cpu.user + cpu.sys) / cpu.total,
		mem: (mem.rss + mem.heapTotal + mem.external) / os.totalmem()
	};
	if (!!cb) cb(result);
	return result;
};

module.exports = getHealth;

_('Utils').getHealth = getHealth;