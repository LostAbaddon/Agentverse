/**
 * Name:	SyncLock
 * Desc:    同步锁
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2019.09.16
 */

class SyncLock {
	#locked    = false;
	#waiters   = []; // 等待锁的人
	#followers = []; // 等待所有锁释放而不需要锁的人
	lock () {
		return new Promise(res => {
			if (!this.#locked) {
				this.#locked = true;
				return res();
			}
			this.#waiters.push(res);
		});
	}
	unlock (nextStep = false) {
		if (!this.#locked) return;
		if (this.#waiters.length === 0) {
			this.#locked = false;
			if (this.#followers.length > 0) {
				let foers = this.#followers;
				this.#followers = [];
				if (nextStep) setImmediate(() => {
					foers.forEach(cb => cb(true));
					foers.splice(0, foers.length);
					foers = null;
					if (!this.#locked && this.#followers.length > 0) this.unlock(false);
				});
				else {
					foers.forEach(cb => cb(true));
					foers.splice(0, foers.length);
					foers = null;
					if (!this.#locked && this.#followers.length > 0) this.unlock(false);
				}
			}
			return;
		}
		var cb = this.#waiters.splice(0, 1)[0];
		if (nextStep) setImmediate(() => {
			cb();
			cb = null;
		});
		else {
			cb();
			cb = null;
		}
	}
	onUnlock (allDone = false) {
		return new Promise(res => {
			if (allDone) {
				if (this.#followers.length === 0) return res(false);
			} else {
				if (!this.#locked) return res(false);
			}
			this.#followers.push(res);
		});
	}
	get locked () {
		return this.#locked;
	}
	get done () {
		return this.#waiters.length === 0;
	}
	get followers () {
		return this.#followers.length;
	}
}

module.exports = SyncLock;
_('Events.SyncLock', SyncLock);