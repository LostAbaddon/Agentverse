const LRUCache = _('DataStore.LRUCache');

const messageHistory = new LRUCache(200);
const MessageBus = {
	hasMsgRecord (id) {
		return messageHistory.has(id);
	},
	addMsgRecord (id) {
		return messageHistory.set(id, true);
	}
};

module.exports = MessageBus;
_('Core.MessageBus', MessageBus);