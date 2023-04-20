const Quark = require('./quark');
const Atom = require('./atom');

const IDSet = [Math.floor(Math.range(256)), Math.floor(Math.range(256)), Math.floor(Math.range(256))];
const IDChars = ('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz=+').split('');

const newShortID = () => {
	var id = [...IDSet];
	IDSet[0] ++;
	if (IDSet[0] === 256) {
		IDSet[0] = 0;
		IDSet[1] ++;
		if (IDSet[1] === 256) {
			IDSet[1] = 0;
			IDSet[2] ++;
			if (IDSet[2] === 256) IDSet[2] = 0;
		}
	}
	return id;
};
const newLongID = (len=8) => {
	var id = [];
	for (let i = 0; i < len; i ++) {
		id.push(Math.pick(IDChars));
	}
	return id.join('');
};

const packageMessage = (msg, size, id) => {
	if (msg instanceof Uint8Array) {
		msg = Buffer.from(msg);
	}
	else if (!(msg instanceof Buffer)) {
		msg = JSON.stringify(msg);
		msg = Uint8Array.fromString(msg);
		msg = Buffer.from(msg);
	}
	var len = msg.byteLength, left = len;
	var count = Math.ceil(len / size);
	var packs = [];
	id = id || newShortID();
	for (let i = 0; i < count; i ++) {
		let start = size * i;
		let end = start + size;
		if (end > len) end = len;
		let buf = Buffer.alloc(end - start + 13);
		buf[0] = id[0];
		buf[1] = id[1];
		buf[2] = id[2];
		buf.writeUInt16BE(count, 4);
		buf.writeUInt16BE(i, 7);
		let l = left > size ? size : left;
		left -= l;
		buf.writeUInt16BE(l, 10);
		msg.copy(buf, 13, start, end);
		packs.push(buf);
	}
	return packs;
};
const unpackMessage = msg => {
	var len = msg.byteLength;
	var fid = msg.subarray(0, 3);
	fid = [...fid];
	var count = msg.subarray(4, 6);
	count = count.readUInt16BE(0, 2);
	var index = msg.subarray(7, 9);
	index = index.readUInt16BE(0, 2);
	var l = msg.subarray(10, 12);
	l = l.readUInt16BE(0, 2);
	if (len - 13 < l) l = len - 13;
	var data = Buffer.alloc(l);
	msg.copy(data, 0, 13, len);
	return {
		id: fid,
		count, index,
		data
	}
};

_('Message.newShortID', newShortID);
_('Message.newLongID', newLongID);
_('Message.packageMessage', packageMessage);
_('Message.unpackMessage', unpackMessage);

const QuarkShakehand = new Quark(2, "shakehand", {
	id: "bytes|34",
	pubkey: "bytes|270",
	delegator: "bool",
	services: "[string]",
});
class Shakehand extends Atom('shakehand') {
	id = '';
	pubkey = '';
	delegator = false;
	services = [];
	constructor (id, pubkey, services, delegator=false) {
		super();

		if (id instanceof Uint8Array) id = id.toBase64();
		else if (id instanceof Buffer) id = id.toString('base64');
		this.id = id;

		if (pubkey instanceof Uint8Array) pubkey = pubkey.toBase64();
		else if (pubkey instanceof Buffer) pubkey = pubkey.toString('base64');
		this.pubkey = pubkey;

		this.delegator = delegator;
		if (!!services) this.services.push(...services);
	}
	toString () {
		var buf = this.toData();
		if (buf instanceof Uint8Array) return buf.toBase64();
		else return buf.toString('base64');
	}
	toJSON (withPackerID = false) {
		var json = {};
		if (withPackerID) json.packerID = this.packerID;
		json.id = this.id;
		json.pubkey = this.pubkey;
		json.delegator = this.delegator;
		json.services = [...this.services];
		return json;
	}
	toData (withPrefix = false) {
		var json = {};
		json.packerID = this.packerID;
		json.id = Buffer.from(this.id, 'base64');
		json.pubkey = Buffer.from(this.pubkey, 'base64');
		json.delegator = this.delegator;
		json.services = [...this.services];
		return Shakehand.structure.pack(json, withPrefix);
	}
	toBuffer () {
		return this.toData().toBuffer();
	}
	get available () {
		return this.id.length > 0;
	}
	static fromJSON (json) {
		return new Shakehand(json.id, json.pubkey, json.services, !!json.delegator);
	}
	static fromString (str) {
		var buf = Buffer.from(str, 'base64');
		return Shakehand.fromData(buf);
	}
}
Atom.register('shakehand', Shakehand);
_('Message.Shakehand', Shakehand);