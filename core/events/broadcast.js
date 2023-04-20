/**
 * Name:	Broadcast
 * Desc:    广播
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2017.11.17
 */

const EM = require('./eventManager');

class BroadcastEvent extends EM.EventData {
	constructor (publisher, channel, message, type, target) {
		super('Broadcast', publisher);
		this.current = channel;
		this.data = message;
		this.bubbleUp = true;
		type = type || Broadcast.Types.QUEST;
		var id = String.random(64);
		Object.defineProperty(
			this,
			'id',
			{
				configurable: false,
				enumerable: true,
				get: () => id
			}
		);
		Object.defineProperty(
			this,
			'channel',
			{
				configurable: false,
				enumerable: true,
				get: () => channel
			}
		);
		Object.defineProperty(
			this,
			'type',
			{
				configurable: false,
				enumerable: true,
				get: () => type
			}
		);
		if (type !== Broadcast.Types.QUEST) Object.defineProperty(
			this,
			'target',
			{
				configurable: false,
				enumerable: true,
				get: () => target
			}
		);
	}
}
class ChannelNode {
	constructor (path) {
		this.path = path;
		this.parent = null;
		this.children = [];
	}
	static getPathList (path) {
		path = path.replace(/[\n\t\r\\]+/gi, '/').split('/');
		return path.map(p => p.replace(/(^[ 　]+|[ 　]+$)/gi, '')).filter(p => p.length > 0);
	}
	static addNode (root, path) {
		path = ChannelNode.getPathList(path);
		var fullpath = '', parent = null;
		path.forEach(p => {
			fullpath += '/' + p;
			var n = root.channels[fullpath];
			if (!n) {
				n = new ChannelNode(fullpath);
				root.channels[fullpath] = n;
			}
			if (!!parent) {
				n.parent = parent;
				if (parent.children.indexOf(n) < 0) parent.children.push(n);
			}
			parent = n;
		});
		return parent;
	}
}

class Broadcast {
	constructor () {
		var em = new EM(null, null, BroadcastEvent, true);
		Object.defineProperty(this, 'em', {
			configurable: false,
			enumerable: false,
			get: () => em
		});
		var channels = {};
		Object.defineProperty(this, 'channels', {
			configurable: false,
			enumerable: false,
			get: () => channels
		});
		Object.defineProperty(this, 'channelList', {
			configurable: false,
			enumerable: true,
			get: () => Object.keys(channels)
		});
	}
	subscribe (channel, callback) {
		channel = ChannelNode.addNode(this, channel);
		this.em.on(channel.path, callback);
		return this;
	}
	unsubscribe (channel, callback) {
		channel = ChannelNode.addNode(this, channel);
		this.em.off(channel.path, callback);
		return this;
	}
	publish (channel, message, publisher) {
		channel = ChannelNode.addNode(this, channel);
		var event = new BroadcastEvent(publisher || this, channel.path, message);
		while (!!channel) {
			event.current = channel.path;
			this.em.emit(channel.path, event);
			if (!event.bubbleUp) break;
			channel = channel.parent;
		}
		return event.id;
	}
	answer (channel, message, publisher) {
		channel = ChannelNode.addNode(this, channel);
		var event = new BroadcastEvent(publisher || this, channel.path, message, Broadcast.Types.REPLY);
		while (!!channel) {
			event.current = channel.path;
			this.em.emit(channel.path, event);
			if (!event.bubbleUp) break;
			channel = channel.parent;
		}
		return event.id;
	}
}
Broadcast.Event = BroadcastEvent;
Broadcast.Types = Symbol.setSymbols(null, ['QUEST', 'REPLY']);

module.exports = Broadcast;
_('Events.Broadcast', Broadcast);