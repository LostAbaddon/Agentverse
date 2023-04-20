const path = require('path');
const fs = require('fs');

const stat = fs.statSync;
const readdir = fs.readdirSync;

const AvailableExtTypes = ['.js', '.json'];

var load_root = __dirname + path.sep + '..' + path.sep + '..' + path.sep;

const getDir = dir => {
	if (dir[0] === '~' && dir[1] === path.sep) dir = process.cwd() + dir.substring(1, dir.length);
	else if (dir[0] !== path.sep && dir[1] !== ':') dir = load_root + dir;
	return path.resolve(dir);
};
const loadall = (url, is_all) => {
	var headers = [], files = [], folders = [];
	readdir(url).forEach(p => {
		if (p[0] === '.') return;
		p = url + path.sep + p;
		if (exceptions.indexOf(p) >= 0) return;
		var s = stat(p);
		if (s.isFile()) {
			let dirname = path.dirname(p).split(path.sep).pop();
			let filename = path.basename(p)
			let ext = path.extname(p);
			filename = filename.substring(0, filename.length - ext.length);
			ext = ext.toLowerCase();
			if (AvailableExtTypes.indexOf(ext) >= 0) {
				if (filename === 'index') {
					headers[1] = p;
				}
				else if (filename === dirname) {
					headers[0] = p;
				}
				else {
					files.push(p);
				}
			}
		}
		else if (is_all && s.isDirectory()) {
			folders.push(p);
		}
	});
	folders.forEach(p => loadall(p, is_all));
	files.forEach(p => require(p));
	if (headers[0]) require(headers[0]);
	if (headers[1]) require(headers[1]);
};
const exceptions = [];
const except = url => {
	if (String.is(url)) url = [url];
	url = url.forEach(u => {
		u = getDir(u);
		if (exceptions.indexOf(u) < 0) exceptions.push(u);
	});
};

global.loadall = (...args) => {
	var is_all = args.filter(b => (b === true || b === false))[0];
	if (is_all !== true && is_all !== false) is_all = true;
	var url = args.filter(s => s + '' === s);
	url = path.join(...url);
	url = getDir(url);
	loadall(url, is_all);
	process.emit('load');
};
global.loadall.except = except;
global.load = url => {
	url = getDir(url);
	var s;
	try {
		s = stat(url);
	}
	catch (e) {
		url = url + '.js';
		try {
			s = stat(url);
		}
		catch (err) {
			return null;
		}
	}
	if (s.isFile()) {
		return require(url);
	}
	else if (s.isDirectory()) {
		loadall(url, true);
		return null;
	}
};
global.setLoadRoot = url => load_root = url;
global.getLoadPath = getDir;