const Path = require('path');
const FSP = require('fs').promises;
const Crypto = require('../kernel/crypto');
const MultiHash = require('../kernel/multihash');
const newLongID = _('Message.newLongID');
const Shakehand = _('Message.Shakehand');
const Logger = new (_("Utils.Logger"))('Personel');

const CryptoType = 'rsa';
const HashType = 'RSA-SHA256';

global.Personel = global.Personel || { name: 'fuck' };

const init = async cfg => {
	var filepath = String.is(cfg.personel) ? cfg.personel : './personel.json';
	if (filepath.indexOf('.') === 0) filepath = Path.join(process.cwd(), filepath);

	var personel;
	try {
		personel = require(filepath);
	}
	catch (err) {
		if (err.code !== 'MODULE_NOT_FOUND') {
			Logger.error(err);
		}
		personel = null;
	}

	if (!!personel) {
		if (!personel.id || !personel.publicKey || !personel.privateKey) {
			personel = null;
		}
		else {
			let check = false;
			try {
				check = checkKeyID(personel.publicKey, personel.id);
			}
			catch {
				check = false;
			}
			if (!check) personel = null;
		}
	}

	if (!personel) {
		personel = createPersonel();
		await FSP.writeFile(filepath, JSON.stringify(personel, null, '\t'));
	}

	global.Personel.id = personel.id;
	global.Personel.publicKey = personel.publicKey;
	global.Personel.privateKey = personel.privateKey;
	global.PersonCard = (new Shakehand(personel.id, personel.publicKey, cfg.api.services, global.isDelegator));
};
const createPersonel = () => {
	var info = {
		id: '',
		publicKey: '',
		privateKey: ''
	};

	var { privateKey, publicKey } = Crypto.generateKeyPair(CryptoType);
	info.publicKey = Crypto.convertKey2Base64(publicKey);
	info.privateKey = Crypto.convertKey2Base64(privateKey);

	var hash = Crypto.crypto.createHash(HashType);
	hash.update(Buffer.from(info.publicKey, 'base64'));
	hash = hash.digest();
	var mh = new MultiHash(HashType, hash);
	info.id = mh.toString();

	return info;
};
const checkKeyID = (pubkey, id) => {
	var hash = Crypto.crypto.createHash(HashType);
	hash.update(Buffer.from(pubkey, 'base64'));
	hash = hash.digest();
	var mh = new MultiHash(HashType, hash);
	var nid = MultiHash.fromString(id);
	return nid.equal(mh);
};

module.exports = {
	init,
	create: createPersonel,
	check: checkKeyID,
};
_('Core.Personel', module.exports);