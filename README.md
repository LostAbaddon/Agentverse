# Agentverse: the multiverse for AI-Agents

This is an autonomous multi-agent AI platform, based on Claude.

## Slogan

**Physics help us to know the universe. AI help us to simulate the universe!**

## Usage

1.	Start AI daemon: `node index --daemon`
2.	Ask AI: `node index ask "question"`
3.	Task Mode: `node index task "task description" --max=max`, `max` for max loops that Agentverse can call the AI service.

## Files and Folders

### ai/agent

In `ai/agent` folder, there lies the AI agents, one file for one AI agent.

### commands

In `commands` folder, there lies the extensions which the AI agent can use.

### prompts

In `prompts` folder, there lies the prompts that every AI agent and role can use, file name format is `agentname-rolename.ini`.

## Vendor

-	Node.js 20.0.0
-	[jLAss](https://github.com/LostAbaddon/jLAss): my javascript lib.
-	[EmptyNodeProject](https://github.com/LostAbaddon/EmptyNodeProject): my nodejs backend architecture, based on jLAss.