/**
 * Name:	LRU Cache
 * Desc:    基于Map的最近使用缓存
 * Author:	LostAbaddon
 * Version:	0.0.4
 * Date:	2019.06.22
 */

const SymbUpdate = Symbol('update');
const DefaultSize = 100;

class LRUCache {
	#cache;
	#secondary;
	#limit;
	#length;
	constructor (limit=DefaultSize) {
		this.#cache = new Map();
		this.#secondary = new Map();
		this.#limit = Number.is(limit) ? limit : DefaultSize;
		this.#length = 0;
	}
	set (k, v) {
		const has = this.#cache.has(k);
		if (!has) this[SymbUpdate](k, v);
		else this.#cache.set(k, v);
	}
	get (k) {
		var v = this.#cache.get(k);
		if (v !== undefined) return v;
		v = this.#secondary.get(k);
		if (v !== undefined) this[SymbUpdate](k, v);
		return v;
	}
	del (k) {
		const has = this.#cache.has(k);
		if (has) this.#length --;
		this.#cache.delete(k);
		this.#secondary.delete(k);
	}
	has (k) {
		return this.#cache.has(k) || this.#secondary.has(k);
	}
	clear () {
		this.#cache.clear();
		this.#secondary.clear();
		this.#length = 0;
	}
	[SymbUpdate] (k, v) {
		this.#length ++;
		if (this.#length >= this.#limit) {
			this.#secondary = this.#cache;
			this.#cache = new Map();
			this.#length = 0;
		}
		this.#cache.set(k, v);
	}
}

class LRUCacheWithDatastore extends LRUCache {
	#ds;
	constructor (limit=DefaultSize, ds) {
		super(limit);
		this.#ds = ds || new Map();
	}
	set (k, v) {
		super.set(k, v);
		this.#ds.set(k, v);
	}
	get (k) {
		var v = super.get(k);
		if (v === undefined) {
			v = this.#ds.get(k);
			if (v !== undefined) this[SymbUpdate](k, v);
		}
		return v;
	}
	del (k) {
		super.del(k);
		this.#ds.delete(k);
	}
	has (k) {
		return this.#ds.has(k);
	}
	clear () {
		super.clear();
		this.#ds.clear();
	}
}

LRUCache.withDatastore = LRUCacheWithDatastore;

module.exports = LRUCache;
_('DataStore.LRUCache', LRUCache);