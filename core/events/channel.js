/**
 * Name:	Channel
 * Desc:    通道
 * Author:	LostAbaddon
 * Version:	0.0.2
 * Date:	2018.11.15
 */

class Channel {
	constructor (consumeFirst=false) {
		this._producer = [];
		this._consumer = [];
		this._consumeFirst = !!consumeFirst;
		this._running = true;
		this._dying = false;

		this._friends = new Set();
	}
	push (data) {
		return new Promise((res, rej) => {
			if (!this._running) {
				res();
				return;
			}
			if (this._consumer.length === 0) {
				if (this._dying) {
					res();
					return;
				}
				this._producer.push([data, res]);
			}
			else {
				let c = this._consumer.shift();
				if (this._consumeFirst) {
					setImmediate(() => c(data));
					setImmediate(() => res());
				}
				else {
					setImmediate(() => res());
					setImmediate(() => c(data));
				}
				if (this._dying) this.close();
			}
		});
	}
	pull () {
		return new Promise((res, rej) => {
			if (!this._running) {
				res();
				return;
			}
			if (this._producer.length === 0) {
				if (this._dying) {
					res();
					return;
				}
				this._consumer.push(res);
			}
			else {
				let p = this._producer.shift();
				if (this._consumeFirst) {
					setImmediate(() => res(p[0]));
					setImmediate(() => p[1]());
				}
				else {
					setImmediate(() => p[1]());
					setImmediate(() => res(p[0]));
				}
				if (this._dying) this.close();
			}
		});
	}
	kill () {
		this._dying = true;
		if (!this._running) return;
		this._producer.forEach(p => setImmediate(() => p[1]()));
		this._consumer.forEach(c => setImmediate(() => c()));
		this._running = false;
		if (this._friends) {
			let f = this._friends;
			this._friends = null;
			f.forEach(c => c.kill());
		}
	}
	close () {
		this._dying = true;
		if (this._producer.length + this._consumer.length === 0) this._running = false;
		if (this._friends) {
			let f = this._friends;
			this._friends = null;
			f.forEach(c => c.close());
		}
	}
	get alive () {
		return !this._dying && this._running;
	}
	async combine (channel) {
		if (this._friends.has(channel)) return;
		this._friends.add(channel);
		channel.combine(this);

		while (this.alive || channel.alive) {
			let msg = await this.pull();
			channel.push(msg);
		}
	}
}

exports.Channel = Channel;
_('Events.Channel', Channel);