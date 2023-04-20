// Author:  LostAbaddon
// Version: 0.1
// Date:    2019.07.02
//
// 发送线程管理平台，用于端口调度、会话管理、数据收发，并将结果传给主线程中的接口
// 每个发送线程中只能有一个Bundle，统一管理所有事物

require('../index');
const Parent = require('worker_threads').parentPort;
const Data = require('worker_threads').workerData;
global.config = Data.config; // 先后顺序不能换
const Fiber = require('./fiber.js');

const postMsg = (event, data) => {
	Parent.postMessage({ event, data });
};

const bundleList = new Set();
const bundleMap = new Map();

const getTaskName = task => {
	return task.protocol + '-' + task.address + '-' + task.port;
};
const pickFiber = task => {
	var name = getTaskName(task);
	var fibers = bundleMap.get(name);
	var fiber = null;
	// 如果没有同名Fiber，则创建
	if (!fibers) {
		// 如果正在运行的Fiber已经过多，则让task处于等待状态
		if (bundleList.size >= config.limit.connection) return null;
		fibers = new Set();
		fiber = new Fiber();
		fibers.add(fiber);
		bundleMap.set(name, fibers);
		bundleList.add(fiber);
		return fiber;
	}
	// 如果有同名Fiber，检查是否有闲置Fiber
	for (let f of fibers) {
		if (!fiber && f.status === Fiber.Status.IDLE) {
			fiber = f;
		} else if (f.status === Fiber.Status.TERMINATED) {
			fibers.delete(f);
		}
	};
	// 如果有同名闲置Fiber，则使用该Fiber
	if (!!fiber) return fiber;

	// 如果正在运行的Fiber已经过多，则让task处于等待状态
	if (bundleList.size >= config.limit.connection) return null;
	// 如果有同名Fiber，则检查是否同名Fiber过多，如果过多则让task等待
	if (fibers.size >= config.limit.contemporary) return null;

	// 创建同名Fiber并返回
	fiber = new Fiber();
	fibers.add(fiber);
	bundleList.add(fiber);

	return fiber;
};

const TaskQueue = new Set();
const addTask = task => {
	TaskQueue.add(task);
	pickTask();
};
const pickTask = () => {
	// 关闭停止信道
	for (let [name, bundle] of bundleMap) {
		for (let fiber of bundle) {
			if (fiber.status === Fiber.Status.TERMINATED) {
				bundle.delete(fiber);
				bundleList.delete(fiber);
			}
		}
	}

	var needClear = false;
	// 复用原有信道
	for (let task of TaskQueue) {
		let fiber = pickFiber(task);
		if (!!fiber) {
			TaskQueue.delete(task);
			sendMessage(fiber, task);
		} else {
			needClear = true;
		}
		if (bundleList.size >= config.limit.connection) break;
	}
	if (!needClear) return;

	// 关闭同名闲置信道
	var largeIdles = []; // 所有闲置信道
	var smallIdles = []; // 所有同名闲置信道中非最近项
	var append2smallIdle = info => smallIdles.push(info);
	for (let [name, bundle] of bundleMap) {
		let idles = [];
		for (let fiber of bundle) {
			if (fiber.status !== Fiber.Status.IDLE) continue;
			let info = [fiber.timestamp, bundle, fiber];
			idles.push(info);
			largeIdles.push(info);
		}
		if (idles.length !== bundle.size) {
			// 不同说明还有非闲置信道，从而所有闲置信道都加入smallIdles中
			idles.forEach(append2smallIdle);
		} else {
			// 相同，则需要过滤掉最新更新的信道
			idles.sort((ia, ib) => ia[0] - ib[0]);
			idles.pop();
			idles.forEach(append2smallIdle);
		}
	}

	var count = TaskQueue.size, l;
	// 先释放重名闲置信道
	l = smallIdles.length;
	if (l > count) l = count;
	smallIdles.sort((ia, ib) => ia[0] - ib[0]);
	for (let i = 0; i < l; i ++) {
		let info = smallIdles[i];
		largeIdles.remove(info);
		bundleList.delete(info[2]);
		info[1].delete(info[2]);
	}
	smallIdles = null;
	count -= l;
	// 如果还不足，则从全部闲置信道中释放信道
	if (count > 0) {
		l = largeIdles.length;
		if (l > count) l = count;
		largeIdles.sort((ia, ib) => ia[0] - ib[0]);
		for (let i = 0; i < l; i ++) {
			let info = largeIdles[i];
			bundleList.delete(info[2]);
			info[1].delete(info[2]);
		}
		largeIdles = null;
	}

	// 再一次选择信道
	for (let task of TaskQueue) {
		let fiber = pickFiber(task);
		if (!!fiber) {
			TaskQueue.delete(task);
			sendMessage(fiber, task);
		}
		if (bundleList.size >= config.limit.connection) break;
	}
};

const TaskPool = new Map();
const sendMessage = (fiber, task) => {
	TaskPool.set(task.id, [fiber, task]);
	fiber.sendMessage(task.id, task.address, task.port, task.protocol, task.data, (ok, err) => {
		TaskPool.delete(task.id);
		// 如果当前Fiber已停止工作，则销毁并移除
		if (fiber.status === Fiber.Status.TERMINATED) {
			fiber.suicide();
			bundleList.delete(fiber);
			let bundle = bundleMap.get(fiber.name);
			if (!!bundle) bundle.delete(fiber);
		}

		if (ok) postMsg('task', { id: task.id, ok, err: null });
		else postMsg('task', { id: task.id, ok, err: err.message });
		pickTask();
	});
};

Parent.on('message', (msg) => {
	if (msg.event === 'task') {
		msg.task.id = msg.id;
		addTask(msg.task);
	}
});

postMsg('init');