// Author:  LostAbaddon
// Version: 0.1
// Date:    2019.07.02
//
// 主线程中的管理接口，作为主线程与网络端口监听线程之间的桥梁
// 每个Section与一个Bundle对应，管理所有网络通讯，主要工作是分配端口有会话管理
// 整体结构：
//		- Section：主线程入口
//		- Bundle：发送线程管理入口，用户信道管理、会话管理和单向通讯
//		- Fiber：地址管理器（同一个address绑定一个fiber）
//		- Germ: 信道组管理器（同一个目标port+protocol绑定一个germ，一个germ可以开多个jet，端口紧张时自动销毁不用jet）
//		- Jet：通讯管理器（通讯信道，本地端口与目标端口保持绑定，用于传输数据，可以有多个jet指向同一个目标，但通讯端口不同）

const Config = require('./default.js');
const Thread = require('worker_threads').Worker;

const IDLength = 15;

const Section = {};
var Bundle;

const newTaskID = () => Buffer.from(new Uint8Array(Array.generate(IDLength, i => Math.floor(Math.random() * 256)))).toString('base64');
const TaskMap = new Map();

const onMessage = (event, data) => {
	if (event === 'task') {
		let tid = data.id;
		if (!tid) return;
		let task = TaskMap.get(tid);
		if (!task) return;
		TaskMap.delete(tid);
		task.callback(data);
	} else {
		console.log(event, data);
	}
};
Section.init = (callback) => {
	Bundle = new Thread(__dirname + '/bundle.js', { workerData: { config: Config.sender } });
	Bundle.on('message', (msg) => {
		if (msg.event === 'init') {
			callback(Section);
		} else {
			onMessage(msg.event, msg.data);
		}
	});
};
Section.sendMessage = promisify((address, port, protocol, msg, res) => {
	var task = {
		id: newTaskID(),
		task: {
			address, port, protocol,
			data: msg,
			timestamp: Date.now()
		},
		callback: res
	};
	TaskMap.set(task.id, task);
	Bundle.postMessage({
		event: 'task',
		id: task.id,
		task: task.task
	});
});

module.exports = Section;