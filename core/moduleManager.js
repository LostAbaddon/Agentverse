/**
 * Name:	Module Manager
 * Desc:    模块管理
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2017.08.26
 */

const ModuleManager = {};

ModuleManager.dump = path => {
	path = require.resolve(path);
	var module = require.cache[path];
	if (module.parent) {
		module.parent.children.splice(module.parent.children.indexOf(module), 1);
	}
	delete require.cache[path];
};
ModuleManager.reload = path => {
	ModuleManager.dump(path);
	return require(path);
};

module.exports = ModuleManager;

_('Utils.ModuleManager', ModuleManager);