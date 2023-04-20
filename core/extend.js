/**
 * Name:	Auxillary Utils and Extends
 * Desc:    常用基础类拓展
 * Author:	LostAbaddon
 * Version:	0.0.4
 * Date:	2019.06.03
 */

const Version = require('./utils/version');

if (global._env === 'node') {
	let ver = new Version(process.version);
	if (ver.isLessThan('10.5')) {
		global._canThread = false;
	} else if (ver.isLargerThan('12.0')) {
		global._canThread = true;
	} else if (process.execArgv.indexOf('--experimental-worker') >= 0) {
		global._canThread = true;
	} else {
		global._canThread = false;
	}
}

loadall(__dirname + '/extends/');