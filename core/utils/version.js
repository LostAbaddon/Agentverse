/**
 * Name:	Version Parse
 * Desc:    版本号工具
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2018.11.03
 */

class Version {
	constructor (main, sub, min, build, stage) {
		if (main instanceof Version) {
			this.main = main.main;
			this.sub = main.sub;
			this.min = main.min;
			this.build = main.build;
			this.stage = main.stage;
		}
		else if (sub === undefined) {
			main = (main + '').trim().toLowerCase();
			if (main.indexOf('ver ') === 0) main = main.substring(4, main.length);
			else if (main.indexOf('ver') === 0) main = main.substring(3, main.length);
			else if (main.indexOf('v') === 0) main = main.substring(1, main.length);
			main = main.trim();
			main = main.split(' ');
			if (main.length === 1) main[1] = 'release';
			main[0] = main[0].split('.');
			main[0][0] = main[0][0] * 1 || 0;
			main[0][1] = main[0][1] * 1 || 0;
			main[0][2] = main[0][2] * 1 || 0;
			main[0][3] = main[0][3] * 1 || 0;
			this.main = main[0][0];
			this.sub = main[0][1];
			this.min = main[0][2];
			this.build = main[0][3];
			this.stage = main[1];
		}
		else {
			this.main = isNaN(main) ? 0 : main;
			this.sub = isNaN(sub) ? 0 : sub;
			this.min = isNaN(min) ? 0 : min;
			this.build = isNaN(build) ? 0 : build;
			stage = stage || 'test';
			this.stage = Version.stages.indexOf(stage) >= 0 ? stage : 'test';
		}
	}
	toString () {
		var version = this.main + '.' + this.sub + '.' + this.min
		if (this.build > 0) version = version + '.' + this.build;
		if (this.stage !== 'release') version = version + ' ' + this.stage;
		return version;
	}
	isLargerThan (ver) {
		ver = new Version(ver);
		if (this.main !== ver.main) return this.main > ver.main;
		if (this.sub !== ver.sub) return this.sub > ver.sub;
		if (this.min !== ver.min) return this.min > ver.min;
		if (this.build !== ver.build) return this.build > ver.build;
		var ms = Version.stages.indexOf(this.stage);
		var vs = Version.stages.indexOf(ver.stage);
		if (ms < 0) ms = 4;
		if (vs < 0) vs = 4;
		ms = 4 - ms;
		vs = 4 - vs;
		if (ms !== vs) return ms > vs;
		return false;
	}
	isLessThan (ver) {
		ver = new Version(ver);
		if (this.main !== ver.main) return this.main < ver.main;
		if (this.sub !== ver.sub) return this.sub < ver.sub;
		if (this.min !== ver.min) return this.min < ver.min;
		if (this.build !== ver.build) return this.build < ver.build;
		var ms = Version.stages.indexOf(this.stage);
		var vs = Version.stages.indexOf(ver.stage);
		if (ms < 0) ms = 4;
		if (vs < 0) vs = 4;
		ms = 4 - ms;
		vs = 4 - vs;
		if (ms !== vs) return ms < vs;
		return false;
	}
	isEqual (ver) {
		ver = new Version(ver);
		if (this.main !== ver.main) return false;
		if (this.sub !== ver.sub) return false;
		if (this.min !== ver.min) return false;
		if (this.build !== ver.build) return false;
		if (this.stage !== ver.stage) return false;
	}
	static get stages () {
		return ['relase', 'beta', 'alpha', 'test'];
	}
}

module.exports = Version;
_('Utils.Version', Version);