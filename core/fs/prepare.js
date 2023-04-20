/**
 * Name:	Prepare Folder
 * Desc:    创建指定路径的文件夹
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2017.11.09
 */

const FS = require('fs');
const Path = require('path');

const preparePath = (path, cb) => new Promise(async res => {
	FS.access(path, (err) => {
		if (!err) {
			if (!!cb) cb(true);
			res(true);
			return;
		}
		var parent = Path.parse(path).dir;
		preparePath(parent, (result) => {
			if (!result) {
				if (!!cb) cb(false);
				res(false);
				return;
			}
			FS.mkdir(path, (err) => {
				if (!err) {
					if (!!cb) cb(true);
					res(true);
					return;
				}
			});
		});
	});
});
const preparePathSync = path => {
	var has;
	try {
		has = FS.accessSync(path);
		return true;
	}
	catch (err) {}
	var parent = Path.parse(path).dir;
	has = preparePathSync(parent);
	if (!has) return false;
	try {
		FS.mkdirSync(path);
		return true;
	}
	catch (err) {
		return false;
	}
};

_("Utils").preparePath = preparePath;
_("Utils").preparePathSync = preparePathSync;