/**
 * Name:	FileSystem Utils
 * Desc:    文件系统工具
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2017.10.24
 * Note:	mkfolder函数可创建指定目录，且如果该目录的父目录不存在则一并创建。主要解决多个目录同时创建时异步导致的重复创建问题
 * 			存在的问题：创建过程中删除父目录，会导致创建失败
 * 			filterPath函数可对路径数组做判断，是文件、目录、不存在还是其它，返回一个JSON对象
 * 			createFolders函数，批量创建目录，Promise化
 * 			createEmptyFiles函数，批量创建空文件，Promise化
 * 			deleteFiles函数，批量删除文件，Promise化
 * 			deleteFolders函数，批量删除文件夹，Promise化
 */

const FS = require('fs');
const Path = require('path');
const setStyle = require('../commandline/setConsoleStyle');

const IDLE = Symbol('IDLE');
const BUSY = Symbol('BUSY');
const FREE = Symbol('FREE');
const DIED = Symbol('DIED');

var manager = {
	tasks: {},
	status: IDLE,
	hooks: {},
	prepare: {}
};

// 批量创建目录，自动处理依赖关系，并解决异步创建过程中的冲突问题
FS.mkfolder = (path, cb) => new Promise(async (resolve, reject) => {
	path = Path.normalize(path);
	path = path.replace(new RegExp(Path.sep + '+$'), '');
	path = path.split(Path.sep);
	var p = '';
	var tasks = [];
	path.map(f => {
		p += f;
		if (p.length > 0) { // 注册任务
			tasks.push(p);
		}
		p += Path.sep;
	});
	var err = await mkfTask(tasks);
	if (!!err) {
		reject(err);
		if (!!cb) cb(err);
	}
	else {
		resolve();
		if (!!cb) cb();
	}
});
var mkfTask = pool => new Promise((resolve, reject) => {
	var path = pool[pool.length - 1];
	manager.hooks[path] = err => {
		if (!err) resolve();
		else resolve(err);
	};
	manager.prepare[path] = pool;
	pool.map(p => {
		var list = [];
		pool.some(q => {
			if (p === q) return true;
			list.push(q);
		});
		manager.prepare[p] = list;
	});
	pool.map(p => {
		if (!manager.tasks[p]) manager.tasks[p] = IDLE;
	});
	if (manager.status === BUSY) return;
	manager.status = BUSY;
	mkLoop();
});
var mkLoop = () => {
	var keys = Object.keys(manager.tasks);
	keys.sort((ka, kb) => ka > kb ? 1 : -1);
	var done = true;
	keys.map(async path => {
		var status = manager.tasks[path];
		// 若已完成某项工作，检查是否有回调
		if (status === FREE || status === DIED) return;
		done = false;
		// 某项工作尚未开始
		if (status === IDLE) {
			// 检查是否存在该目录
			manager.tasks[path] = BUSY;
			FS.stat(path, (err, stat) => {
				if (!err) { // 顺利结束
					manager.tasks[path] = FREE;
					let cb = manager.hooks[path];
					if (!!cb) cb();
					mkLoop();
					return;
				}
				// 检查上级目录情况
				var shouldWait = false, canBuild = true;
				var prepares = manager.prepare[path];
				prepares.map(p => {
					var status = manager.tasks[p];
					if (status === IDLE || status === BUSY) {
						shouldWait = true;
						canBuild = false
						return;
					}
					else if (status === DIED) {
						canBuild = false;
					}
				});
				if (shouldWait) { // 有上级目录尚未创建，等待
					manager.tasks[path] = IDLE;
				}
				else if (canBuild) { // 都已准备好，创建
					FS.mkdir(path, (err, stat) => {
						var cb = manager.hooks[path];
						if (!!err) {
							manager.tasks[path] = DIED;
							if (!!cb) cb(err);
						}
						else {
							manager.tasks[path] = FREE;
							if (!!cb) cb();
						}
						mkLoop();
					});
				}
				else { // 上级目录都已创建，报错
					manager.tasks[path] = DIED;
					let cb = manager.hooks[path];
					if (!!cb) cb(err);
				}
				mkLoop();
			});
		}
	});
	// 清除工作状态
	if (done) {
		manager.status = IDLE;
		manager.tasks = {};
		manager.hooks = {};
		manager.prepare = {};
	}
};

// 批量获取路径状态：不存在、文件、目录、其它
FS.filterPath = (paths, cb) => new Promise((res, rej) => {
	var count = paths.length, nonexist = [], files = [], folders = [], wrong = [];
	if (count === 0) {
		let result = { nonexist, files, folders, wrong };
		setImmediate(() => {
			res(result);
			if (cb) cb(result);
		});
		return;
	}
	paths.forEach(path => {
		FS.stat(path, (err, stat) => {
			if (!!err || !stat) {
				nonexist.push(path);
			}
			else if (stat.isFile()) {
				files.push(path);
			}
			else if (stat.isDirectory()) {
				folders.push(path);
			}
			else {
				wrong.push(path);
			}
			count --;
			if (count > 0) return;
			var result = { nonexist, files, folders, wrong };
			res(result);
			if (cb) cb(result);
		});
	});
});
// 批量创建文件夹
FS.createFolders = (folders, logger) => new Promise((res, rej) => {
	logger = logger || console;
	var count = folders.length, result = { success: [], failed: [] };
	if (count === 0) {
		setImmediate(() => {
			res(result);
		});
		return;
	}
	folders.forEach(async folder => {
		logger.log(setStyle('创建目录：', 'bold') + folder);
		var err = await FS.mkfolder(folder);
		if (!!err) {
			logger.error(setStyle('创建目录错误：', 'red bold') + folder);
			logger.error(err);
			result.failed.push(folder);
		}
		else {
			result.success.push(folder);
		}
		count --;
		if (count > 0) return;
		res(result);
	});
});
// 批量创建空文件
FS.createEmptyFiles = (files, logger) => new Promise((res, rej) => {
	logger = logger || console;
	var count = files.length, result = { success: [], failed: [] };
	if (count === 0) {
		setImmediate(() => {
			res(result);
		});
		return;
	}
	files.forEach(file => {
		logger.log(setStyle('创建文件：', 'bold') + file);
		FS.appendFile(file, '', 'utf8', err => {
			if (!!err) {
				logger.error(setStyle('创建文件错误：', 'red bold') + file);
				logger.error(err);
				result.failed.push(file);
			}
			else {
				result.success.push(file);
			}
			count --;
			if (count > 0) return;
			res(result);
		});
	});
});
// 批量删除文件
FS.deleteFiles = (files, logger) => new Promise((res, rej) => {
	logger = logger || console;
	var count = files.length, result = { success: [], failed: [] };
	if (count === 0) {
		setImmediate(() => {
			res(result);
		});
		return;
	}
	files.forEach(file => {
		logger.info(setStyle('删除文件：', 'bold') + file);
		FS.unlink(file, err => {
			if (!!err) {
				logger.error(setStyle('删除文件错误：', 'red bold') + file);
				logger.error(err);
				result.failed.push(file);
			}
			else {
				result.success.push(file);
			}
			count --;
			if (count > 0) return;
			res(result);
		});
	});
});
// 批量删除文件夹
var deleteFolders = (files, logger) => new Promise((res, rej) => {
	logger = logger || console;
	var count = files.length, result = { success: [], failed: [] };
	if (count === 0) {
		setImmediate(() => {
			res(result);
		});
		return;
	}
	files.forEach(file => {
		logger.info(setStyle('删除目录：', 'bold') + file);
		FS.rmdir(file, err => {
			if (!!err) {
				logger.error(setStyle('删除目录错误：', 'red bold') + file);
				logger.error(err);
				result.failed.push(file);
			}
			else {
				result.success.push(file);
			}
			count --;
			if (count > 0) return;
			res(result);
		});
	});
});
var deleteFoldersForcely = (files, logger) => new Promise((res, rej) => {
	logger = logger || console;
	var count = files.length, result = { success: [], failed: [] };
	if (count === 0) {
		setImmediate(() => {
			res(result);
		});
		return;
	}
	var cb = () => {
		count --;
		if (count > 0) return;
		res(result);
	};
	files.forEach(file => {
		FS.readdir(file, async (err, fls) => {
			if (!!err) {
				result.failed.push(file);
				cb();
			}
			else if (fls.length === 0) {
				let stat = await deleteFolders([file], logger);
				stat.success.forEach(p => result.success.push(file));
				stat.failed.forEach(p => result.failed.push(file));
				cb();
			}
			else {
				fls = fls.map(p => file + Path.sep + p);
				fls = await FS.filterPath(fls);
				let task = 2;
				let job = async () => {
					task --;
					if (task > 0) return;
					let stat = await deleteFolders([file], logger);
					stat.success.forEach(p => result.success.push(file));
					stat.failed.forEach(p => result.failed.push(file));
					cb();
				};
				(async () => {
					var stat = await FS.deleteFiles(fls.files, logger);
					stat.success.forEach(p => result.success.push(p));
					stat.failed.forEach(p => result.failed.push(p));
					job();
				}) ();
				(async () => {
					var stat = await deleteFoldersForcely(fls.folders, logger);
					stat.success.forEach(p => result.success.push(p));
					stat.failed.forEach(p => result.failed.push(p));
					job();
				}) ();
			}
		});
	});
});
FS.deleteFolders = (files, force, logger) => new Promise(async (res, rej) => {
	var result;
	if (!!force) result = await deleteFoldersForcely(files, logger);
	else result = await deleteFolders(files, logger);
	res(result);
});

class FolderWatcher {
	constructor (folder, delay, isFile) {
		this.changeList = [];
		try {
			this.watcher = FS.watch(folder, { recursive: true }, (stat, file) => {
				if (isFile) file = folder;
				else file = folder + Path.sep + file;
				if (this.changeList.indexOf(file) < 0) this.changeList.push(file);
				if (!!this.timer) clearTimeout(this.timer);
				this.timer = setTimeout(async () => {
					var list = this.changeList.copy();
					this.changeList.splice(0, this.changeList.length);
					list = await FS.filterPath(list);
					var result = { delete: list.nonexist, create: [] };
					list.folders.forEach(p => result.create.push(p));
					list.files.forEach(p => result.create.push(p));
					if (!!this.callbacks.onCreate && result.create.length > 0) this.callbacks.onCreate(result.create);
					if (!!this.callbacks.onDelete && result.delete.length > 0) this.callbacks.onDelete(result.delete);
				}, this.delay);
			});
		}
		catch (err) {
			this.watcher = null;
			throw err;
		}
		this.timer = null;
		this.delay = delay || 1000;
		this.callbacks = { onCreate: null, onDelete: null };
	}
	onCreate (cb) {
		if (cb instanceof Function) this.callbacks.onCreate = cb;
		return this;
	}
	onDelete (cb) {
		if (cb instanceof Function) this.callbacks.onDelete = cb;
		return this;
	}
	close () {
		if (!!this.timer) clearTimeout(this.timer);
		if (!!this.watcher) this.watcher.close();
	}
}
FS.watchFolderAndFile = (folder, delay, isFile, onCreate, onDelete) => {
	var watcher = new FolderWatcher(folder, delay, isFile);
	if (onCreate instanceof Function) watcher.onCreate(onCreate);
	if (onDelete instanceof Function) watcher.onDelete(onDelete);
	return watcher;
};