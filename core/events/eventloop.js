/**
 * Name:	事件循环器
 * Desc:    以一定时间间隔触发响应事件，可用于批量化事件处理。
 *          没有事件时不工作，有事件后延时触发，并继续收集事件，等待下一次触发。
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2019.06.20
 */

const Trigger = require('./delaytrigger.js');

class EventLoop {
	constructor (duration) {
	}
}

exports.EventLoop = EventLoop;
_('Events.EventLoop', EventLoop);