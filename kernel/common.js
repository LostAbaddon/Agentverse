const FS = require('fs');
const Path = require('path');

const getAllContents = path => new Promise(res => {
	var subs = [];
	FS.readdir(path, (err, list) => {
		if (!!err || !list || !list.length) {
			res(subs);
			return;
		}
		var count = list.length;
		if (count === 0) return res(subs);

		list.forEach(sub => {
			sub = Path.join(path, sub);
			FS.stat(sub, async (err, stat) => {
				if (!err && !!stat) {
					if (stat.isDirectory()) {
						sub = await getAllContents(sub);
						subs.push(...sub);
					}
					else if (stat.isFile()) {
						subs.push(sub);
					}
				}

				count --;
				if (count === 0) res(subs);
			})
		});
	});
});
const getAllSubFolders = path => new Promise(res => {
	var count = 0;
	var subs = [];
	FS.readdir(path, (err, list) => {
		if (!!err || !list || !list.length) {
			res(subs);
			return;
		}
		count = list.length;
		list.forEach(sub => {
			sub = Path.join(path, sub);
			FS.stat(sub, (err, stat) => {
				count --;
				if (!err && !!stat && stat.isDirectory()) {
					subs.push(sub);
				}
				if (count === 0) res(subs);
			})
		});
	});
});
const getJSON = path => new Promise(res => {
	FS.readFile(path, 'utf8', (err, data) => {
		if (!!err || !data) {
			res({});
			return;
		}
		try {
			data = JSON.parse(data);
		}
		catch {
			res({});
			return;
		}
		res(data);
	});
});
const saveFile = (path, content, coding='utf8') => new Promise((res, rej) => {
	if (coding !== null && !String.is(content) && !Number.is(content) && !Boolean.is(content)) content = JSON.stringify(content);
	FS.writeFile(path, content, coding, err => {
		if (!!err) rej(err);
		else res();
	})
});
const getLocalIP = () => {
	var ips = [];
	var interfaces = require('os').networkInterfaces();
	for (let networks in interfaces) {
		networks = interfaces[networks];
		for (let addr of networks) {
			if (addr.internal) continue;
			if (addr.netmask === '255.255.255.255' || addr.netmask === 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff') continue;
			ips.push([addr.address, addr.family]);
		}
	}
	return ips;
};

_('Utils.getAllContents', getAllContents);
_('Utils.getAllSubFolders', getAllSubFolders);
_('Utils.getJSON', getJSON);
_('Utils.saveFile', saveFile);
_('Utils.getLocalIP', getLocalIP);