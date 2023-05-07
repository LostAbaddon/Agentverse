class AbstractAgent {
	static State = Symbol.set("IDLE", "STANDBY", "RUNNING", "WAITING");
	state = AbstractAgent.State.IDLE;
	id = '';

	constructor (id, config) {
		this.state = AbstractAgent.State.STANDBY;
		this.id = id;
	}

	loadKnowledge (filepath) {}	// load knowledge from file
	getKnowledge () {}			// get all knowledge
	addKnowledge (knowledge) {}	// add new knowledge
	removeKnowledge (index) {}	// remove knowledge

	loadMemory (filepath) {}	// load memory from file
	getMemory () {}				// get all memory
	addMemory (human, ai) {}	// add a conversation to history

	send (prompt, heat, session) {}	// send request to AI backend
	ask (prompt, heat) {}			// continue the chat
	task (task) {}					// complete the mission automonously

	fork () {}	// fork an agent with current session
	copy () {}	// copy a whole new agent with initial setting
}

module.exports = AbstractAgent;