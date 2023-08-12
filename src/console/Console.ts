import { ReservingOverlord } from 'overlords/colonization/reserver';
import {Colony, ColonyMemory, getAllColonies} from '../Colony';
import {Directive} from '../directives/Directive';
import {RoomIntel} from '../intel/RoomIntel';
import {Overlord} from '../overlords/Overlord';
import {ExpansionEvaluator} from '../strategy/ExpansionEvaluator';
import {Cartographer} from '../utilities/Cartographer';
import {EmpireAnalysis} from '../utilities/EmpireAnalysis';
import {alignedNewline, bullet} from '../utilities/stringConstants';
import {color, printRoomName, toColumns} from '../utilities/utils';
import {asciiLogoRL, asciiLogoSmall} from '../visuals/logos';
import {DEFAULT_OVERMIND_SIGNATURE, MY_USERNAME, USE_SCREEPS_PROFILER} from '../~settings';
import {log} from './log';
import {DirectiveOutpost} from 'directives/colony/outpost';
import {TaskSignController} from 'tasks/instances/signController';
import columnify from 'columnify';

type RecursiveObject = { [key: string]: number | RecursiveObject };

interface MemoryDebug {
	debug?: boolean;
}

interface ConsoleCommand {
	name: string,
	description: string;
	command: (...args: any[]) => string | void;
}

/**
 * OvermindConsole registers a number of global methods for direct use in the Screeps console
 */
export class OvermindConsole {

	static commands: ConsoleCommand[] = [
	{
		name: 'help',
		description: 'show this message',
		command: () => OvermindConsole.help(),
	},
	{
		name: 'info()',
		description: 'display version and operation information',
		command: () => OvermindConsole.info(),
	},
	{
		name: 'notifications()',
		description: 'print a list of notifications with hyperlinks to the console',
		command: () => OvermindConsole.notifications(),
	},
	{
		name: 'setMode(mode)',
		description: 'set the operational mode to "manual", "semiautomatic", or "automatic"',
		command: OvermindConsole.setMode.bind(OvermindConsole),
	},
	{
		name: 'setSignature(newSignature)',
		description: 'set your controller signature; no argument sets to default',
		command: OvermindConsole.setSignature.bind(OvermindConsole),
	},
	{
		name: 'print(...args[])',
		description: 'log stringified objects to the console',
		command: OvermindConsole.print.bind(OvermindConsole),
	},
	{
		name: 'debug(thing | ...things)',
		description: 'enable debug logging for a game object or process',
		command: OvermindConsole.debug.bind(OvermindConsole),
	},
	{
		name: 'stopDebug(thing | ...things)',
		description: 'disable debug logging for a game object or process',
		command: OvermindConsole.debug.bind(OvermindConsole),
	},
	{
		name: 'timeit(function, repeat=1)',
		description: 'time the execution of a snippet of code',
		command: OvermindConsole.timeit.bind(OvermindConsole),
	},
	{
		name: 'profileOverlord(overlord, ticks?)',
		description: 'start profiling on an overlord instance or name',
		command: OvermindConsole.profileOverlord.bind(OvermindConsole),
	},
	{
		name: 'finishProfilingOverlord(overlord)',
		description: 'stop profiling on an overlord',
		command: OvermindConsole.finishProfilingOverlord.bind(OvermindConsole)
	},
	{
		name: 'setLogLevel(int)',
		description: 'set the logging level from 0 - 4',
		command: log.setLogLevel.bind(OvermindConsole)
	},
	{
		name: 'suspendColony(roomName)',
		description: 'suspend operations within a colony',
		command: OvermindConsole.suspendColony.bind(OvermindConsole),
	},
	{
		name: 'unsuspendColony(roomName)',
		description: 'resume operations within a suspended colony',
		command: OvermindConsole.unsuspendColony.bind(OvermindConsole),
	},
	{
		name: 'listSuspendedColonies()',
		description: 'Prints all suspended colonies',
		command: OvermindConsole.listSuspendedColonies.bind(OvermindConsole),
	},
	{
		name: 'openRoomPlanner(roomName)',
		description: 'open the room planner for a room',
		command: OvermindConsole.openRoomPlanner.bind(OvermindConsole),
	},
	{
		name: 'closeRoomPlanner(roomName)',
		description: 'close the room planner and save changes',
		command: OvermindConsole.closeRoomPlanner.bind(OvermindConsole),
	},
	{
		name: 'cancelRoomPlanner(roomName)',
		description: 'close the room planner and discard changes',
		command: OvermindConsole.cancelRoomPlanner.bind(OvermindConsole),
	},
	{
		name: 'listActiveRoomPlanners()',
		description: 'display a list of colonies with open room planners',
		command: OvermindConsole.listActiveRoomPlanners.bind(OvermindConsole),
	},
	{
		name: 'destroyErrantStructures(roomName)',
		description: 'destroys all misplaced structures within an owned room',
		command: OvermindConsole.destroyErrantStructures.bind(OvermindConsole),
	},
	{
		name: 'destroyAllHostileStructures(roomName)',
		description: 'destroys all hostile structures in an owned room',
		command: OvermindConsole.destroyAllHostileStructures.bind(OvermindConsole),
	},
	{
		name: 'destroyAllBarriers(roomName)',
		description: 'destroys all ramparts and barriers in a room',
		command: OvermindConsole.destroyAllBarriers.bind(OvermindConsole),
	},
	{
		name: 'listConstructionSites(filter?)',
		description: 'list all construction sites matching an optional filter',
		command: OvermindConsole.listConstructionSites.bind(OvermindConsole),
	},
	{
		name: 'removeUnbuiltConstructionSites()',
		description: 'removes all construction sites with 0 progress',
		command: OvermindConsole.removeUnbuiltConstructionSites.bind(OvermindConsole),
	},
	{
		name: 'listDirectives(filter?)',
		description: 'list directives, matching a filter if specified',
		command: OvermindConsole.listDirectives.bind(OvermindConsole),
	},
	{
		name: 'listPersistentDirectives()',
		description: 'print type, name, pos of every persistent directive',
		command: OvermindConsole.listPersistentDirectives.bind(OvermindConsole),
	},
	{
		name: 'removeFlagsByColor(color, secondaryColor)',
		description: 'remove flags that match the specified colors',
		command: OvermindConsole.removeFlagsByColor.bind(OvermindConsole),
	},
	{
		name: 'removeErrantFlags()',
		description: 'remove all flags which don\'t match a directive',
		command: OvermindConsole.removeErrantFlags.bind(OvermindConsole),
	},
	{
		name: 'deepCleanMemory()',
		description: 'deletes all non-critical portions of memory (be careful!)',
		command: OvermindConsole.deepCleanMemory.bind(OvermindConsole),
	},
	{
		name: 'profileMemory(root=Memory, depth=1)',
		description: 'scan through memory to get the size of various objects',
		command: OvermindConsole.profileMemory.bind(OvermindConsole),
	},
	{
		name: 'startRemoteDebugSession()',
		description: 'enables the remote debugger so Muon can debug your code',
		command: OvermindConsole.startRemoteDebugSession.bind(OvermindConsole),
	},
	{
		name: 'cancelMarketOrders(filter?)',
		description: 'cancels all market orders matching filter (if provided)',
		command: OvermindConsole.cancelMarketOrders.bind(OvermindConsole),
	},
	{
		name: 'setRoomUpgradeRate(room, upgradeRate)',
		description: 'changes the rate which a room upgrades at, default is 1',
		command: OvermindConsole.setRoomUpgradeRate.bind(OvermindConsole),
	},
	{
		name: 'getEmpireMineralDistribution()',
		description: 'returns current census of colonies and mined sk room minerals',
		command: OvermindConsole.getEmpireMineralDistribution.bind(OvermindConsole),
	},
	{
		name: 'getPortals(rangeFromColonies)',
		description: 'returns active portals within colony range',
		command: OvermindConsole.listPortals.bind(OvermindConsole),
	},
	{
		name: 'evaluateOutpostEfficiencies()',
		description: 'prints all colony outposts efficiency',
		command: OvermindConsole.evaluateOutpostEfficiencies.bind(OvermindConsole),
	},
	{
		name: 'evaluatePotentialOutpostEfficiencies()',
		description: 'prints all nearby unmined outposts',
		command: OvermindConsole.evaluatePotentialOutpostEfficiencies.bind(OvermindConsole),
	},
	{
		name: 'showRoomSafety(roomName?)',
		description: 'show gathered safety data about rooms',
		command: OvermindConsole.showRoomSafety.bind(OvermindConsole),
	},
];

	static init() {
		// @ts-expect-error set this one directly so that the parsing happens once
		global.help = this.help();
		for (const cmd of this.commands) {
			const para = cmd.name.indexOf('(');
			const funcName = para !== -1 ? cmd.name.substring(0, para) : cmd.name;
			// @ts-expect-error define commands on the global object
			global[funcName] = cmd.command;
		}
	}

	// Help, information, and operational changes ======================================================================

	static help() {
		let msg = '\n<font color="#ff00ff">';
		for (const line of asciiLogoSmall) {
			msg += line + '\n';
		}
		msg += '</font>';

		// Console list
		const descr: { [functionName: string]: string } = {};
		for (const cmd of this.commands) {
			if (!cmd.description) continue;
			descr[cmd.name] = cmd.description;
		}
		const descrMsg = toColumns(descr, {justify: true, padChar: '.'});
		const maxLineLength = _.max(_.map(descrMsg, line => line.length)) + 2;
		msg += 'Console Commands: '.padRight(maxLineLength, '=') + '\n' + descrMsg.join('\n');

		msg += '\n\nRefer to the repository for more information\n';

		return msg;
	}

	static printUpdateMessage(aligned = false): void {
		const joinChar = aligned ? alignedNewline : '\n';
		const msg = `Codebase updated or global reset. Type "help" for a list of console commands.` + joinChar +
					color(asciiLogoSmall.join(joinChar), '#ff00ff') + joinChar +
					OvermindConsole.info(aligned);
		log.alert(msg);
	}

	static printTrainingMessage(): void {
		console.log('\n' + asciiLogoRL.join('\n') + '\n');
	}

	static info(aligned = false): string {
		const b = bullet;
		const checksum = Assimilator.generateChecksum();
		const clearanceCode = Assimilator.getClearanceCode(MY_USERNAME);
		const baseInfo = [
			`${b}Version:        Overmind v${__VERSION__}`,
			`${b}Checksum:       ${checksum}`,
			`${b}Assimilated:    ${clearanceCode ? 'Yes' : 'No'} (clearance code: ${clearanceCode}) [WIP]`,
			`${b}Operating mode: ${Memory.settings.operationMode}`,
		];
		const joinChar = aligned ? alignedNewline : '\n';
		return baseInfo.join(joinChar);
	}

	static notifications(): string {
		const notifications = Overmind.overseer.notifier.generateNotificationsList(true);
		return _.map(notifications, msg => bullet + msg).join('\n');
	}

	static setMode(mode: operationMode): string {
		switch (mode) {
			case 'manual':
				Memory.settings.operationMode = 'manual';
				return `Operational mode set to manual. Only defensive directives will be placed automatically; ` +
					   `remove harvesting, claiming, room planning, and raiding must be done manually.`;
			case 'semiautomatic':
				Memory.settings.operationMode = 'semiautomatic';
				return `Operational mode set to semiautomatic. Claiming, room planning, and raiding must be done ` +
					   `manually; everything else is automatic.`;
			case 'automatic':
				Memory.settings.operationMode = 'automatic';
				return `Operational mode set to automatic. All actions are done automatically, but manually placed ` +
					   `directives will still be responded to.`;
			default:
				return `Invalid mode: please specify 'manual', 'semiautomatic', or 'automatic'.`;
		}
	}


	static setSignature(signature: string | undefined): string | undefined {
		const sig = signature ? signature : DEFAULT_OVERMIND_SIGNATURE;
		if (sig.length > 100) {
			throw new Error(`Invalid signature: ${signature}; length is over 100 chars.`);
		} else if (sig.toLowerCase().includes('overmind') || sig.includes(DEFAULT_OVERMIND_SIGNATURE)) {
			Memory.settings.signature = sig;

			_.each(Overmind.colonies, colony => {
				const signer = _.sample(colony.getZergByRole("worker"));
				if (!signer) {
					log.warning(`${colony.print}: unable to find a random worker to re-sign the controller`);
					return;
				}
				signer.task = new TaskSignController(colony.controller);
			})

			_.filter(Overmind.directives, directive => directive instanceof DirectiveOutpost)
				.forEach(directive => {
					const overlord = <ReservingOverlord>directive.overlords.reserve;
					overlord.settings.resetSignature = true;
					if (overlord.reservers[0]) {
						overlord.reservers[0].task = null;
					}
				});
			return `Controller signature set to ${sig}`;
		} else {
			throw new Error(`Invalid signature: ${signature}; must contain the string "Overmind" or ` +
							`${DEFAULT_OVERMIND_SIGNATURE} (accessible on global with __DEFAULT_OVERMIND_SIGNATURE__)`);
		}
	}


	// Debugging methods ===============================================================================================

	static debug(...things: { name?: string, ref?: string, print?: string, memory: MemoryDebug }[]): string {
		let mode;
		const debugged = [];
		for (const thing of things) {
			const name = `${thing.print || thing.ref || thing.name || '(no name or ref)'}`
			if (thing.memory && thing.memory.debug && mode === undefined || mode === false) {
				mode = false;
				delete thing.memory.debug;
				debugged.push(name);
			} else if (thing.memory && mode === undefined || mode === true) {
				mode = true;
				thing.memory.debug = true;
				debugged.push(name);
			} else {
				log.info(`don't know what to do with ${thing}`);
				return;
			}
		}
		return `${mode ? "Enabled" : "Disabled"} debugging for ${debugged.join(", ")}`;
	}

	static startRemoteDebugSession(): string {
		global.remoteDebugger.enable();
		return `Started remote debug session.`;
	}

	static endRemoteDebugSession(): string {
		global.remoteDebugger.disable();
		return `Ended remote debug session.`;
	}

	static print(...args: any[]): string {
		let message = '';
		for (const arg of args) {
			let cache: any[] = [];
			const msg = JSON.stringify(arg, function(key, value: any): any {
				if (typeof value === 'object' && value !== null) {
					if (cache.indexOf(value) !== -1) {
						// Duplicate reference found
						try {
							// If this value does not reference a parent it can be deduped
							// eslint-disable-next-line
							return JSON.parse(JSON.stringify(value));
						} catch (error) {
							// discard key if value cannot be deduped
							return;
						}
					}
					// Store value in our collection
					cache.push(value);
				}
				// eslint-disable-next-line
				return value;
			}, '\t');
			// @ts-expect-error Clear out the cache
			cache = null;
			message += '\n' + msg;
		}
		return message;
	}

	static timeit(callback: () => any, repeat = 1): string {
		const start = Game.cpu.getUsed();
		let i: number;
		for (i = 0; i < repeat; i++) {
			callback();
		}
		const used = Game.cpu.getUsed() - start;
		return `CPU used: ${used}. Repetitions: ${repeat} (${used / repeat} each).`;
	}

	// Overlord profiling ==============================================================================================
	static profileOverlord(overlord: Overlord | string, ticks?: number): string {
		const overlordInstance = typeof overlord == 'string' ? Overmind.overlords[overlord]
															 : overlord as Overlord | undefined;
		if (!overlordInstance) {
			return `No overlord found for ${overlord}!`;
		} else {
			overlordInstance.startProfiling(ticks);
			return `Profiling ${overlordInstance.print} for ${ticks || 'indefinite'} ticks.`;
		}
	}

	static finishProfilingOverlord(overlord: Overlord | string): string {
		const overlordInstance = typeof overlord == 'string' ? Overmind.overlords[overlord]
															 : overlord as Overlord | undefined;
		if (!overlordInstance) {
			return `No overlord found for ${overlord}!`;
		} else {
			overlordInstance.finishProfiling();
			return `Profiling ${overlordInstance.print} stopped.`;
		}
	}


	// Colony suspension ===============================================================================================

	static suspendColony(roomName: string): string {
		if (Overmind.colonies[roomName]) {
			const colonyMemory = Memory.colonies[roomName] as ColonyMemory | undefined;
			if (colonyMemory) {
				colonyMemory.suspend = true;
				Overmind.shouldBuild = true;
				return `Colony ${roomName} suspended.`;
			} else {
				return `No colony memory for ${roomName}!`;
			}
		} else {
			return `Colony ${roomName} is not a valid colony!`;
		}
	}

	static unsuspendColony(roomName: string): string {
		const colonyMemory = Memory.colonies[roomName] as ColonyMemory | undefined;
		if (colonyMemory) {
			if (!colonyMemory.suspend) {
				return `Colony ${roomName} is not suspended!`;
			} else {
				delete colonyMemory.suspend;
				Overmind.shouldBuild = true;
				return `Colony ${roomName} unsuspended.`;
			}
		} else {
			return `No colony memory for ${roomName}!`;
		}
	}

	static listSuspendedColonies(): string {
		let msg = 'Colonies currently suspended: \n';
		for (const i in Memory.colonies) {
			const colonyMemory = Memory.colonies[i] as ColonyMemory | undefined;
			if (colonyMemory && colonyMemory.suspend == true) {
				msg += 'Colony ' + i + ' \n';
			}
		}
		return msg;
	}

	// Room planner control ============================================================================================

	static openRoomPlanner(roomName: string): string {
		if (Overmind.colonies[roomName]) {
			if (Overmind.colonies[roomName].roomPlanner.active != true) {
				Overmind.colonies[roomName].roomPlanner.active = true;
				return '';
			} else {
				return `RoomPlanner for ${roomName} is already active!`;
			}
		} else {
			return `Error: ${roomName} is not a valid colony!`;
		}
	}

	static closeRoomPlanner(roomName: string): string {
		if (Overmind.colonies[roomName]) {
			if (Overmind.colonies[roomName].roomPlanner.active) {
				Overmind.colonies[roomName].roomPlanner.finalize();
				return '';
			} else {
				return `RoomPlanner for ${roomName} is not active!`;
			}
		} else {
			return `Error: ${roomName} is not a valid colony!`;
		}
	}

	static cancelRoomPlanner(roomName: string): string {
		if (Overmind.colonies[roomName]) {
			if (Overmind.colonies[roomName].roomPlanner.active) {
				Overmind.colonies[roomName].roomPlanner.active = false;
				return `RoomPlanner for ${roomName} has been deactivated without saving changes`;
			} else {
				return `RoomPlanner for ${roomName} is not active!`;
			}
		} else {
			return `Error: ${roomName} is not a valid colony!`;
		}
	}

	static listActiveRoomPlanners(): string {
		const coloniesWithActiveRoomPlanners: Colony[] = _.filter(
			_.map(_.keys(Overmind.colonies), colonyName => Overmind.colonies[colonyName]),
			(colony: Colony) => colony.roomPlanner.active);
		const names: string[] = _.map(coloniesWithActiveRoomPlanners, colony => colony.room.print);
		if (names.length > 0) {
			console.log('Colonies with active room planners: ' + names.toString());
			return '';
		} else {
			return `No colonies with active room planners`;
		}
	}

	static listConstructionSites(filter?: (site: ConstructionSite) => any): string {
		let msg = `${_.keys(Game.constructionSites).length} construction sites currently present: \n`;
		for (const id in Game.constructionSites) {
			const site = Game.constructionSites[id];
			if (!filter || filter(site)) {
				msg += `${bullet}Type: ${site.structureType}`.padRight(20) +
					   `Pos: ${site.pos.print}`.padRight(65) +
					   `Progress: ${site.progress} / ${site.progressTotal} \n`;
			}
		}
		return msg;
	}

	// Directive management ============================================================================================

	static listDirectives(filter?: (dir: Directive) => any): string {
		let msg = '';
		for (const i in Overmind.directives) {
			const dir = Overmind.directives[i];
			if (!filter || filter(dir)) {
				msg += `${bullet}Name: ${dir.print}`.padRight(70) +
					   `Colony: ${dir.colony.print}`.padRight(55) +
					   `Pos: ${dir.pos.print}\n`;
			}
		}
		return msg;
	}

	static removeAllLogisticsDirectives(): string {
		const logisticsFlags = _.filter(Game.flags, flag => flag.color == COLOR_YELLOW &&
															flag.secondaryColor == COLOR_YELLOW);
		for (const dir of logisticsFlags) {
			dir.remove();
		}
		return `Removed ${logisticsFlags.length} logistics directives.`;
	}

	static listPersistentDirectives(): string {
		let msg = '';
		for (const i in Overmind.directives) {
			const dir = Overmind.directives[i];
			if (dir.memory.persistent) {
				msg += `Type: ${dir.directiveName}`.padRight(20) +
					   `Name: ${dir.name}`.padRight(15) +
					   `Pos: ${dir.pos.print}\n`;
			}
		}
		return msg;
	}

	static removeFlagsByColor(color: ColorConstant, secondaryColor: ColorConstant): string {
		const removeFlags = _.filter(Game.flags, flag => flag.color == color && flag.secondaryColor == secondaryColor);
		for (const flag of removeFlags) {
			flag.remove();
		}
		return `Removed ${removeFlags.length} flags.`;
	}

	static removeErrantFlags(): string {
		// This may need to be be run several times depending on visibility
		if (USE_SCREEPS_PROFILER) {
			return `ERROR: should not be run while profiling is enabled!`;
		}
		let count = 0;
		for (const name in Game.flags) {
			if (!Overmind.directives[name]) {
				Game.flags[name].remove();
				count += 1;
			}
		}
		return `Removed ${count} flags.`;
	}


	// Structure management ============================================================================================

	static destroyErrantStructures(roomName: string): string {
		const colony = Overmind.colonies[roomName];
		if (!colony) return `${roomName} is not a valid colony!`;
		const room = colony.room;
		const allStructures = room.find(FIND_STRUCTURES);
		let i = 0;
		for (const s of allStructures) {
			if (s.structureType == STRUCTURE_CONTROLLER) continue;
			if (!colony.roomPlanner.structureShouldBeHere(s.structureType, s.pos)) {
				const result = s.destroy();
				if (result == OK) {
					i++;
				}
			}
		}
		return `Destroyed ${i} misplaced structures in ${roomName}.`;
	}

	static destroyAllHostileStructures(roomName: string): string {
		const room = Game.rooms[roomName];
		if (!room) return `${roomName} is undefined! (No vision?)`;
		if (!room.my) return `${roomName} is not owned by you!`;
		const hostileStructures = room.find(FIND_HOSTILE_STRUCTURES);
		for (const structure of hostileStructures) {
			structure.destroy();
		}
		return `Destroyed ${hostileStructures.length} hostile structures.`;
	}

	static destroyAllBarriers(roomName: string): string {
		const room = Game.rooms[roomName];
		if (!room) return `${roomName} is undefined! (No vision?)`;
		if (!room.my) return `${roomName} is not owned by you!`;
		for (const barrier of room.barriers) {
			barrier.destroy();
		}
		return `Destroyed ${room.barriers.length} barriers.`;
	}

	static removeUnbuiltConstructionSites(): string {
		let msg = '';
		for (const id in Game.constructionSites) {
			const csite = Game.constructionSites[id];
			if (csite.progress == 0) {
				const ret = csite.remove();
				msg += `Removing construction site for ${csite.structureType} with 0% progress at ` +
					   `${csite.pos.print}; response: ${ret}\n`;
			}
		}
		return msg;
	}

	// Colony Management ===============================================================================================

	static setRoomUpgradeRate(roomName: string, rate: number): string {
		const colony: Colony = Overmind.colonies[roomName];
		colony.upgradeSite.memory.speedFactor = rate;

		return `Colony ${roomName} is now upgrading at a rate of ${rate}.`;
	}

	static getEmpireMineralDistribution(): string {
		const minerals = EmpireAnalysis.empireMineralDistribution();
		let ret = 'Empire Mineral Distribution \n';
		for (const mineral in minerals) {
			ret += `${mineral}: ${minerals[mineral]} \n`;
		}
		return ret;
	}

	static listPortals(rangeFromColonies: number = 5, _includeIntershard: boolean = false): string {
		const colonies = getAllColonies();
		const allPortals = colonies.map(colony => RoomIntel.findPortalsInRange(colony.name, rangeFromColonies));
		let ret = `Empire Portal Census \n`;
		for (const [colonyId, portals] of Object.entries(allPortals)) {
			if (_.keys(portals).length > 0) {
				ret += `Colony ${Overmind.colonies[colonyId].print}: \n`;
			}
			for (const portalRoomName of _.keys(portals)) {
				const samplePortal = _.first(portals[portalRoomName]); // don't need to list all 8 in a room
				ret += `\t\t Room ${printRoomName(portalRoomName)} Destination ${samplePortal.dest} ` +
					   `Expiration ${samplePortal[MEM.EXPIRATION] - Game.time}] \n`;
			}
		}
		return ret;
	}

	static evaluateOutpostEfficiencies(): string {
		const outpostsPerColony: [Colony, string[]][] = getAllColonies().filter(c => c.bunker)
			.map(c => [c, c.outposts.map(r => r.name)]);

		return OvermindConsole.reportOutpostEfficiency(outpostsPerColony, (avg, colonyAvg) => avg < colonyAvg * 0.75);
	}

	static evaluatePotentialOutpostEfficiencies(): string {
		const outpostsPerColony: [Colony, string[]][] = getAllColonies().filter(c => c.bunker)
			.map(c => {
				const outpostNames = c.outposts.map(room => room.name);
				return [c, Cartographer.findRoomsInRange(c.name, 2).filter(r => !outpostNames.includes(r))];
			}
		);

		return OvermindConsole.reportOutpostEfficiency(outpostsPerColony,
			(avg, colonyAvg) => avg > colonyAvg * 1.25 || avg > 20);
	}

	static reportOutpostEfficiency(outpostsPerColony: [Colony, string[]][],
			selectionCallback: (avg: number, colonyAvg: number) => boolean): string {
		let msg = `Estimated outpost efficiency:\n`;
		for (const [colony, outposts] of outpostsPerColony) {
			let avgEnergyPerCPU = 0;
			const outpostAvgEnergyPerCPU = [];

			msg += ` • Colony at ${colony.room.name}:\n`
			for (const outpost of outposts) {
				const d = ExpansionEvaluator.computeTheoreticalMiningEfficiency(colony.bunker!.anchor, outpost);

				msg += `\t - ${d.room} ${`(${d.type})`.padLeft(6)}: `;
				msg += `${(d.energyPerSource * d.sources / ENERGY_REGEN_TIME).toFixed(2)} energy/source, `
				msg += `Net income: ${d.netIncome.toFixed(2)}, `;
				msg += `Net energy/CPU: ${(d.netIncome / d.cpuCost).toFixed(2)}\n`;
				msg += `\t   Creep costs: ${d.creepEnergyCost.toFixed(2)} energy/tick, `;
				msg += `spawn time: ${d.spawnTimeCost.toFixed(2)}, CPU: ${d.cpuCost.toFixed(2)} cycles/tick\n`;
				if (d.unreachableSources || d.unreachableController) {
					const { unreachableSources: s, unreachableController: c } = d;
					msg += `\t   ${color("Unreachable:", "yellow")} `;
					if (s) msg += `sources: ${s}`;
					if (s && c) msg += ', ';
					if (c) msg += `controller: ${c}`;
					msg += `\n`;
				}

				outpostAvgEnergyPerCPU.push(d.avgEnergyPerCPU);
				avgEnergyPerCPU += d.avgEnergyPerCPU;
			}

			const bestOutposts = outpostAvgEnergyPerCPU.map((avg, idx) => {
				// 20E/cpu is a good guideline for an efficient room
				if (selectionCallback(avg, avgEnergyPerCPU)) return idx + 1;
					return undefined;
			}).filter(avg => avg);

			msg += `\n   Outposts with above average efficiency of ${avgEnergyPerCPU.toFixed(2)}: `;
			msg += `${bestOutposts.join(", ")}\n`;
		}

		return msg;
	}

	// Memory management ===============================================================================================

	static deepCleanMemory(): string {
		// Clean colony memory
		const protectedColonyKeys = ['defcon', 'roomPlanner', 'roadPlanner', 'barrierPlanner'];
		for (const colName in Memory.colonies) {
			for (const key in Memory.colonies[colName]) {
				if (!protectedColonyKeys.includes(key)) {
					// @ts-expect-error direct property access
					delete Memory.colonies[colName][key];
				}
			}
		}
		// Suicide any creeps which have no memory
		for (const i in Game.creeps) {
			if (_.isEmpty(Game.creeps[i].memory)) {
				Game.creeps[i].suicide();
			}
		}
		// Remove profiler memory
		delete Memory.screepsProfiler;
		// Remove overlords memory from flags
		for (const i in Memory.flags) {
			if (Memory.flags[i].overlords) {
				delete Memory.flags[i].overlords;
			}
		}
		// Clean creep memory
		for (const i in Memory.creeps) {
			// Remove all creep tasks to fix memory leak in 0.3.1
			if (Memory.creeps[i].task) {
				Memory.creeps[i].task = null;
			}
		}
		return `Memory has been cleaned.`;
	}


	private static recursiveMemoryProfile(memoryObject: any, sizes: RecursiveObject, currentDepth: number): void {
		for (const key in memoryObject) {
			if (currentDepth == 0 || !_.keys(memoryObject[key]) || _.keys(memoryObject[key]).length == 0) {
				sizes[key] = JSON.stringify(memoryObject[key]).length;
			} else {
				sizes[key] = {};
				OvermindConsole.recursiveMemoryProfile(memoryObject[key], sizes[key] as RecursiveObject,
													   currentDepth - 1);
			}
		}
	}

	static profileMemory(root = Memory, depth = 1): string {
		const sizes: RecursiveObject = {};
		console.log(`Profiling memory...`);
		const start = Game.cpu.getUsed();
		OvermindConsole.recursiveMemoryProfile(root, sizes, depth);
		console.log(`Time elapsed: ${Game.cpu.getUsed() - start}`);
		return JSON.stringify(sizes, undefined, '\t');
	}

	static cancelMarketOrders(filter?: (order: Order) => boolean): string {
		const ordersToCancel = !!filter ? _.filter(Game.market.orders, order => filter(order)) : Game.market.orders;
		_.forEach(_.values(ordersToCancel), (order: Order) => Game.market.cancelOrder(order.id));
		return `Canceled ${_.values(ordersToCancel).length} orders.`;
	}

	static showRoomSafety(roomName?: string): string {
		const names = roomName ? [roomName] : Object.keys(Memory.rooms);

		let msg = `Room Intelligence data for ${roomName? `room ${roomName}` : "all rooms"}:\n`;
		const roomData = _.sortBy(names.map(n => {
			const {
				threatLevel,
				safeFor,
				unsafeFor,
				invisibleFor,
				combatPotentials,
				numHostiles,
				numBoostedHostiles,
			} = RoomIntel.getSafetyData(n);

			function fmtThreat(lvl: number): string {
				let suffix = "";
				if (lvl < 0.1) suffix = "---";
				else if (lvl < 0.2) suffix = " --";
				else if (lvl < 0.4) suffix = "  -";
				else if (lvl < 0.6) suffix = "   ";
				else if (lvl < 0.8) suffix = "  +";
				else if (lvl < 0.9) suffix = " ++";
				else suffix = "+++";
				return lvl.toFixed(4) + " " + suffix;
			};

			const obj = {
				room: n,
				threatlevel: fmtThreat(threatLevel),
				safeFor: safeFor ?? 0,
				unsafeFor: unsafeFor ?? 0,
				invisibleFor: invisibleFor ?? 0,
				hostiles: numHostiles ?? 0,
				boostedHostiles: numBoostedHostiles ?? 0,
				ranged: combatPotentials?.r ?? 0,
				heal: combatPotentials?.h ?? 0,
				dismantle: combatPotentials?.d ?? 0,
			}
			return obj;
		}), data => data.room);

		msg += columnify(roomData);
		return msg;
	}
}
