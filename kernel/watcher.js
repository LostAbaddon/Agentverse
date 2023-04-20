const Path = require('path');
const FS = require('fs');
const FSP = FS.promises;

const EventType = Symbol.setSymbols('NewFile', 'NewFolder', 'ModifyFile', 'ModifyFolder', 'DeleteFile', 'DeleteFolder');
const WatchList = {};

const lookFolder = async path => {
	var files = [], folders = [], info = {};
	var list = await FSP.readdir(path);
	list = list.map(async p => {
		p = Path.join(path, p);
		var stat = await FSP.stat(p);
		if (stat.isDirectory()) {
			folders.push(p);
			let [subf, subd, subi] = await lookFolder(p);
			files.push(...subf);
			folders.push(...subd);
			Object.assign(info, subi);
		}
		else if (stat.isFile()) {
			files.push(p);
			info[p] = stat.mtime.getTime();
		}
	});
	await Promise.all(list);
	return [files, folders, info];
};

class Watcher {
	#folderpath = '';
	#filemap = {};
	#info = {};
	#watchers = {};
	#onChange = null;
	#timers = {};
	files = [];
	folders = [];
	constructor (path, callback) {
		this.#folderpath = path;
		this.#onChange = callback;

		this.newWatcher = path => {
			return (event, filename) => {
				if (!filename) {
					let timer = this.#timers[path];
					if (!!timer) clearTimeout(timer);
					timer = setTimeout(() => {
						delete this.#timers[path];
						this.checkFolder(path);
					}, 100);
					this.#timers[path] = timer;
				}
				else {
					let targetpath = Path.join(path, filename);
					let timer = this.#timers[targetpath];
					if (!!timer) clearTimeout(timer);
					timer = setTimeout(() => {
						delete this.#timers[targetpath];
						this.checkTarget(targetpath);
					}, 100);
					this.#timers[targetpath] = timer;
				}
			}
		};
	}
	async checkTarget (path) {
		var isFile = this.files.includes(path);
		var isFolder = this.folders.includes(path);
		var info = this.#info[path] || 0;
		var exists = true;
		var stat, didFile = isFile, didFolder = isFolder;
		try {
			stat = await FSP.stat(path);
			if (stat.isFile()) {
				didFile = true;
				didFolder = false;
			}
			else if (stat.isDirectory()) {
				didFile = false;
				didFolder = true;
			}
			else {
				didFile = false;
				didFolder = false;
			}
			stat = stat.mtime.getTime();
		}
		catch {
			exists = false;
			stat = 0;
		}

		if (didFile === didFolder && exists) return; // 其它类型文件对象，直接忽略

		if (!exists) { // 删除
			if (!isFile && !isFolder) return;
			if (isFile) { // 文件被删除
				delete this.#info[path];
				this.files.remove(path);
				this.#onChange(EventType.DeleteFile, path);
			}
			else { // 文件夹被删除
				if (!!this.#watchers[path]) this.#watchers[path].close();
				delete this.#watchers[path];
				this.folders.remove(path);
				this.#onChange(EventType.DeleteFolder, path);
			}
		}
		else if (didFile) {
			if (!isFile) { // 新文件
				this.#info[path] = stat;
				this.files.push(path);
				this.#onChange(EventType.NewFile, path);
			}
			else if (info !== stat) {
				this.#info[path] = stat;
				this.#onChange(EventType.ModifyFile, path);
			}
		}
		else {
			if (!isFolder) { // 新文件夹
				this.folders.push(path);
				this.#watchers[path] = FS.watch(path, this.newWatcher(path));
				this.#onChange(EventType.NewFolder, path);
			}
			else {
				this.#onChange(EventType.ModifyFolder, path);
			}
		}
	}
	async checkFolder (path) {
		var files = await FSP.readdir(path);
		await Promise.all(files.map(async file => {
			file = Path.join(path, file);
			var oldFile = this.files.includes(file);
			var oldFolder = this.folders.includes(file);
			var oldExists = oldFile || oldFolder;
			var oldTime = this.#info[file];
			var stat, newFile, newFolder, newTime;
			try {
				stat = await FSP.stat(file);
				newFile = stat.isFile();
				newFolder = stat.isDirectory();
				if (!newFile && !newFolder) return;
				newTime = stat.mtime.getTime();
			}
			catch {
				newFile = false;
				newFolder = false;
				newTime = 0;
			}
			var newExists = newFile || newFolder;

			if (!oldExists && !newExists) return;
			if (oldExists && !newExists) {
				if (oldFile) { // 文件被删除
					delete this.#info[file];
					this.files.remove(file);
					this.#onChange(EventType.DeleteFile, file);
				}
				else { // 文件夹被删除
					if (!!this.#watchers[file]) this.#watchers[file].close();
					delete this.#watchers[file];
					this.folders.remove(file);
					this.#onChange(EventType.DeleteFolder, file);
				}
			}
			else if (!oldExists && newExists) {
				if (newFile) { // 新文件
					this.#info[file] = newTime;
					this.files.push(file);
					this.#onChange(EventType.NewFile, file);
				}
				else {
					this.folders.push(file);
					this.#watchers[file] = FS.watch(file, this.newWatcher(file));
					this.#onChange(EventType.NewFolder, file);
				}
			}
			else if (newTime !== oldTime) {
				if (oldFile) {
					this.#info[file] = newTime;
					this.#onChange(EventType.ModifyFile, file);
				}
				else {
					this.#onChange(EventType.ModifyFolder, file);
				}
			}
		}));
	}
	async update () {
		if (this.#folderpath.length === 0) return;
		var [files, folders, info] = await lookFolder(this.#folderpath);

		this.#watchers[this.#folderpath] = FS.watch(this.#folderpath, this.newWatcher(this.#folderpath));
		folders.forEach(path => this.#watchers[path] = FS.watch(path, this.newWatcher(path)));

		this.files = files;
		this.folders = folders;
		this.#info = info;
	}
}

const addWatch = async (folderPath, files, callback) => {
	var watcher = WatchList[folderPath];
	if (!!watcher) return watcher.files;
	watcher = new Watcher(folderPath, files, callback);
	WatchList[folderPath] = watcher;
	await watcher.update();
	return watcher.files;
};
const watchFile = (filepath, callback) => {
	var timer;
	FS.watch(filepath, () => {
		if (!!timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			callback();
		}, 100);
	});
};

_('Utils.Watcher', Watcher);
_('Utils.WatchEvents', EventType);
_('Utils.watchFolder', addWatch);
_('Utils.watchFile', watchFile);
module.exports = {
	EventType,
	add: addWatch,
	watchFile
};