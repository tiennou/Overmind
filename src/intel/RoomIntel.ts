// Room intel - provides information related to room structure and occupation

import { profile } from "../profiler/decorator";
import { ExpansionEvaluator } from "../strategy/ExpansionEvaluator";
import { Cartographer } from "../utilities/Cartographer";
import {
	packCoord,
	packCoordList,
	packId,
	packPos,
	unpackCoordAsPos,
	unpackCoordListAsPosList,
	unpackPos,
} from "../utilities/packrat";
import {
	ema,
	entries,
	getCacheExpiration,
	interpolateColor,
	isAlly,
	minMax,
} from "../utilities/utils";
import { CombatIntel } from "./CombatIntel";
import { Visualizer } from "../visuals/Visualizer";
import { FIND_EXIT_PORTAL } from "movement/types";

const RECACHE_TIME = 5000;
const OWNED_RECACHE_TIME = 1000;
const SCORE_RECALC_PROB = 0.05;
const FALSE_SCORE_RECALC_PROB = 0.01;

export const ROOMINTEL_DEFAULT_VISUALS_RANGE = 5;

export interface ExpansionData {
	score: number;
	bunkerAnchor: RoomPosition;
	outposts: { [roomName: string]: number };
}

export interface RoomObjectInfo {
	pos: RoomPosition;
}

export interface PortalInfo extends RoomObjectInfo {
	shardDestination?: { shard: string; room: string } | undefined;
	roomDestination?: RoomPosition | undefined;
	expiration: number | undefined;
}

export interface ControllerInfo extends RoomObjectInfo {
	level: number | undefined;
	owner: string | undefined;
	reservation:
		| {
				username: string;
				ticksToEnd: number;
		  }
		| undefined;
	safemode: number | undefined;
	safemodeAvailable: number;
	safemodeCooldown: number | undefined;
	progress: number | undefined;
	progressTotal: number | undefined;
}

export interface SourceInfo extends RoomObjectInfo {
	containerPos?: RoomPosition;
}

export interface KeeperLairInfo extends RoomObjectInfo {
	chillPos?: RoomPosition;
}

export interface MineralInfo extends RoomObjectInfo {
	mineralType: MineralConstant;
	density: number;
}

export interface DepositInfo extends RoomObjectInfo {
	containerPos?: RoomPosition;
	timeToDecay: number;
	depositType: DepositConstant;
	cooldown: number;
}

export interface ImportantStructureInfo {
	storagePos: RoomPosition | undefined;
	terminalPos: RoomPosition | undefined;
	towerPositions: RoomPosition[];
	spawnPositions: RoomPosition[];
	wallPositions: RoomPosition[];
	rampartPositions: RoomPosition[];
}

export interface RoomInfo {
	controller: ControllerInfo | null | undefined;
	sources: SourceInfo[];
	portals: PortalInfo[];
	mineral: MineralInfo | undefined;
	deposits: DepositInfo[];
	skLairs: RoomObjectInfo[];
	importantStructures: ImportantStructureInfo | undefined;
}

export type RoomExitData = RoomExits[keyof RoomExits];
export interface RoomExits extends ExitsInformation {
	"42"?: PortalInfo[];
}

export interface InvasionData {
	harvested: number;
	lastSeen: number;
}

export interface RoomIntelMemory {
	portalRooms: string[];
}

const defaultRoomIntelMemory: RoomIntelMemory = {
	portalRooms: [],
};

@profile
export class RoomIntel {
	constructor() {
		_.defaultsDeep(Memory.roomIntel, defaultRoomIntelMemory);
	}

	// Making this a static getter prevents us from having to call Overmind.roomIntel.whatever() all the time
	static get memory(): RoomIntelMemory {
		return Memory.roomIntel;
	}

	private static cleanMemory(): void {
		// // Clean out memory of inactive portals // this actually gets done automatically with recordPermanentObjects
		// for (const portalRoomName in this.memory.portalRooms) {
		// 	const portals = this.memory.portalRooms[portalRoomName];
		// 	if (portals) {
		// 		for (const portal of portals) {
		// 			if (portal[MEM.EXPIRATION]) {
		// 				// TODO
		// 			}
		// 		}
		// 	}
		// }
	}

	/**
	 * Mark a room as being visible this tick
	 */
	private static markVisible(room: Room): void {
		room.memory[MEM.TICK] = Game.time;
	}

	/**
	 * Returns the last tick at which the room was visible, or -100
	 */
	static lastVisible(roomName: string): number {
		if (Memory.rooms[roomName]) {
			return Memory.rooms[roomName][MEM.TICK] || -100;
		} else {
			return -100;
		}
	}

	/**
	 * Gets expansion data from a room in readable format. Undefined means that a data is not present, while false
	 * means that the room has been analyzed and determined to be unsuitable for expansion. Be sure to use === when
	 * comparing to false!
	 */
	static getExpansionData(
		roomName: string
	): ExpansionData | false | undefined {
		if (
			!Memory.rooms[roomName] ||
			Memory.rooms[roomName][RMEM.EXPANSION_DATA] === undefined
		) {
			return undefined;
		}
		const data = Memory.rooms[roomName][RMEM.EXPANSION_DATA]!;
		if (data === 0) {
			return false;
		}
		return {
			score: data[RMEM_EXPANSION_DATA.SCORE],
			bunkerAnchor: unpackCoordAsPos(
				data[RMEM_EXPANSION_DATA.BUNKER_ANCHOR],
				roomName
			),
			outposts: data[RMEM_EXPANSION_DATA.OUTPOSTS],
		};
	}

	/**
	 * Sets expansion data for a room. Setting the data to false marks the room as uninhabitable.
	 */
	static setExpansionData(
		roomName: string,
		data: ExpansionData | false
	): void {
		Memory.rooms[roomName] = Memory.rooms[roomName] || {};
		if (data === false) {
			Memory.rooms[roomName][RMEM.EXPANSION_DATA] = 0;
		} else {
			Memory.rooms[roomName][RMEM.EXPANSION_DATA] = {
				[RMEM_EXPANSION_DATA.SCORE]: data.score,
				[RMEM_EXPANSION_DATA.BUNKER_ANCHOR]: packCoord(
					data.bunkerAnchor
				),
				[RMEM_EXPANSION_DATA.OUTPOSTS]: data.outposts,
			};
		}
	}

	/**
	 * Returns information about known portals in a given room
	 */
	static getPortalInfo(roomName: string): PortalInfo[] {
		let portalData = Memory.rooms[roomName]?.[RMEM.PORTALS];
		if (!portalData) {
			return [];
		}
		portalData = _.filter(
			portalData,
			(portal) => Game.time < portal[MEM.EXPIRATION]
		);
		const portals = portalData.map((savedPortal) => {
			const pos = unpackCoordAsPos(savedPortal.c, roomName);
			let portal: PortalInfo;
			if (typeof savedPortal.dest === "string") {
				portal = {
					pos: pos,
					roomDestination: unpackPos(savedPortal.dest),
					expiration: savedPortal[MEM.EXPIRATION],
				};
			} else {
				portal = {
					pos: pos,
					shardDestination: savedPortal.dest,
					expiration: savedPortal[MEM.EXPIRATION],
				};
			}
			return portal;
		});
		return portals;
	}

	/**
	 * Returns information about sources in a given room
	 */
	static getSourceInfo(roomName: string): SourceInfo[] | undefined {
		if (!Memory.rooms[roomName] || !Memory.rooms[roomName][RMEM.SOURCES]) {
			return;
		}
		return _.map(Memory.rooms[roomName][RMEM.SOURCES]!, (savedSource) => ({
			pos: unpackCoordAsPos(savedSource.c, roomName),
			containerPos:
				savedSource.cn ?
					unpackCoordAsPos(savedSource.cn, roomName)
				:	undefined,
		}));
	}

	/**
	 * Returns information about source keeper lairs in a given room
	 */
	static getKeeperLairInfo(roomName: string): KeeperLairInfo[] | undefined {
		if (!Memory.rooms[roomName] || !Memory.rooms[roomName][RMEM.SKLAIRS]) {
			return;
		}
		return _.map(Memory.rooms[roomName][RMEM.SKLAIRS]!, (savedLair) => ({
			pos: unpackCoordAsPos(savedLair.c, roomName),
			chillPos:
				savedLair.cp ?
					unpackCoordAsPos(savedLair.cp, roomName)
				:	undefined,
		}));
	}

	/**
	 * Unpackages saved information about a room's controller
	 * @returns controller info if available, null if there's no controller, undefined otherwise
	 */
	static getControllerInfo(
		roomName: string
	): ControllerInfo | null | undefined {
		if (
			!Memory.rooms[roomName] ||
			Memory.rooms[roomName][RMEM.CONTROLLER] === undefined
		) {
			return;
		}
		const ctlr = Memory.rooms[roomName][RMEM.CONTROLLER]!;
		if (ctlr === null) {
			return null;
		}
		return {
			pos: unpackCoordAsPos(ctlr.c, roomName),
			level: ctlr[RMEM_CTRL.LEVEL],
			owner: ctlr[RMEM_CTRL.OWNER],
			reservation:
				ctlr[RMEM_CTRL.RESERVATION] ?
					{
						username:
							ctlr[RMEM_CTRL.RESERVATION][RMEM_CTRL.RES_USERNAME],
						ticksToEnd:
							ctlr[RMEM_CTRL.RESERVATION][
								RMEM_CTRL.RES_TICKSTOEND
							],
					}
				:	undefined,
			safemode: ctlr[RMEM_CTRL.SAFEMODE],
			safemodeAvailable: ctlr[RMEM_CTRL.SAFEMODE_AVAILABLE],
			safemodeCooldown: ctlr[RMEM_CTRL.SAFEMODE_COOLDOWN],
			progress: ctlr[RMEM_CTRL.PROGRESS],
			progressTotal: ctlr[RMEM_CTRL.PROGRESS_TOTAL],
		};
	}

	static getImportantStructureInfo(
		roomName: string
	): ImportantStructureInfo | undefined {
		if (
			!Memory.rooms[roomName] ||
			!Memory.rooms[roomName][RMEM.IMPORTANT_STRUCTURES]
		) {
			return;
		}
		const data = Memory.rooms[roomName][RMEM.IMPORTANT_STRUCTURES]!;
		return {
			storagePos:
				data[RMEM_STRUCTS.STORAGE] ?
					unpackCoordAsPos(data[RMEM_STRUCTS.STORAGE], roomName)
				:	undefined,
			terminalPos:
				data[RMEM_STRUCTS.TERMINAL] ?
					unpackCoordAsPos(data[RMEM_STRUCTS.TERMINAL], roomName)
				:	undefined,
			towerPositions: unpackCoordListAsPosList(
				data[RMEM_STRUCTS.TOWERS],
				roomName
			),
			spawnPositions: unpackCoordListAsPosList(
				data[RMEM_STRUCTS.SPAWNS],
				roomName
			),
			wallPositions: unpackCoordListAsPosList(
				data[RMEM_STRUCTS.WALLS],
				roomName
			),
			rampartPositions: unpackCoordListAsPosList(
				data[RMEM_STRUCTS.RAMPARTS],
				roomName
			),
		};
	}

	/**
	 * Retrieves all info for permanent room objects and returns it in a more readable/useful form
	 */
	static getAllRoomObjectInfo(roomName: string): RoomInfo | undefined {
		const mem = Memory.rooms[roomName];
		if (mem) {
			const savedSources = mem[RMEM.SOURCES] || [];
			const savedMineral = mem[RMEM.MINERAL];
			let savedDeposits = mem[RMEM.DEPOSITS] || [];
			const savedSkLairs = mem[RMEM.SKLAIRS] || [];

			savedDeposits = savedDeposits.filter((dpst) => {
				const elapsed = Game.time - (dpst[RMEM_DPST.TIME] ?? 0);
				const timeToDecay = dpst[RMEM_DPST.TTL] - elapsed;
				return timeToDecay > 0;
			});

			const returnObject: RoomInfo = {
				controller: this.getControllerInfo(roomName),
				portals: this.getPortalInfo(roomName),
				sources: _.map(savedSources, (src) =>
					src.cn ?
						{
							pos: unpackCoordAsPos(src.c, roomName),
							containerPos: unpackCoordAsPos(src.cn, roomName),
						}
					:	{ pos: unpackCoordAsPos(src.c, roomName) }
				),
				mineral:
					savedMineral ?
						{
							pos: unpackCoordAsPos(savedMineral.c, roomName),
							mineralType: savedMineral[RMEM_MNRL.MINERALTYPE],
							density: savedMineral[RMEM_MNRL.DENSITY],
						}
					:	undefined,
				deposits: savedDeposits.map((dpst) => {
					const elapsed = Game.time - (dpst[RMEM_DPST.TIME] ?? 0);
					const timeToDecay = dpst[RMEM_DPST.TTL] - elapsed;
					const obj: DepositInfo = {
						pos: unpackCoordAsPos(dpst.c, roomName),
						depositType: dpst[RMEM_DPST.DEPOSITTYPE],
						timeToDecay,
						cooldown: dpst[RMEM_DPST.COOLDOWN],
					};
					return obj;
				}),
				skLairs: _.map(savedSkLairs, (lair) => ({
					pos: unpackCoordAsPos(lair.c, roomName),
				})),
				importantStructures: this.getImportantStructureInfo(roomName),
			};

			return returnObject;
		}
	}

	/**
	 * Records all info for permanent room objects, e.g. sources, controllers, etc.
	 */
	private static recordPermanentObjects(room: Room): void {
		room.memory[MEM.TICK] = Game.time;
		if (room.sources.length > 0) {
			room.memory[RMEM.SOURCES] = _.map(room.sources, (source) => {
				const coord = packCoord(source.pos);
				const container = source.pos.findClosestByLimitedRange(
					room.containers,
					2
				);
				return container ?
						{ c: coord, cn: packCoord(container.pos) }
					:	{ c: coord };
			});
		} else {
			delete room.memory[RMEM.SOURCES];
		}
		if (room.controller) {
			room.memory[RMEM.CONTROLLER] = {
				c: packCoord(room.controller.pos),
				[RMEM_CTRL.LEVEL]: room.controller.level,
				[RMEM_CTRL.OWNER]:
					room.controller.owner ?
						room.controller.owner.username
					:	undefined,
				[RMEM_CTRL.RESERVATION]:
					room.controller.reservation ?
						{
							[RMEM_CTRL.RES_USERNAME]:
								room.controller.reservation.username,
							[RMEM_CTRL.RES_TICKSTOEND]:
								room.controller.reservation.ticksToEnd,
						}
					:	undefined,
				[RMEM_CTRL.SAFEMODE]: room.controller.safeMode,
				[RMEM_CTRL.SAFEMODE_AVAILABLE]:
					room.controller.safeModeAvailable,
				[RMEM_CTRL.SAFEMODE_COOLDOWN]: room.controller.safeModeCooldown,
				[RMEM_CTRL.PROGRESS]: room.controller.progress,
				[RMEM_CTRL.PROGRESS_TOTAL]: room.controller.progressTotal,
			};
		} else {
			delete room.memory[RMEM.CONTROLLER];
		}
		if (room.mineral) {
			room.memory[RMEM.MINERAL] = {
				c: packCoord(room.mineral.pos),
				[RMEM_MNRL.DENSITY]: room.mineral.density,
				[RMEM_MNRL.MINERALTYPE]: room.mineral.mineralType,
			};
		} else {
			delete room.memory[RMEM.MINERAL];
		}
		if (room.keeperLairs.length > 0) {
			room.memory[RMEM.SKLAIRS] = _.map(room.keeperLairs, (lair) => {
				// Keeper logic is to just move to the first _.find([...sources, mineral], range <=5); see
				// https://github.com/screeps/engine/blob/master/src/processor/intents/creeps/keepers/pretick.js
				const keeperTarget = _.find(
					_.compact([...room.sources, room.mineral]),
					(thing) => thing!.pos.getRangeTo(lair.pos) <= 5
				);
				let chillPos: RoomPosition | undefined;
				if (keeperTarget) {
					// should always be true
					chillPos =
						lair.pos.findClosestByPath(
							keeperTarget.pos.neighbors
						) || undefined;
				}
				return chillPos ?
						{ c: packCoord(lair.pos), cp: packCoord(chillPos) }
					:	{ c: packCoord(lair.pos) };
			});
		} else {
			delete room.memory[RMEM.SKLAIRS];
		}
		this.recordOwnedRoomStructures(room);
		this.recordPortalInfo(room);
	}

	private static recordDepositsInfo(room: Room) {
		room.memory[RMEM.DEPOSITS] = room.memory[RMEM.DEPOSITS] ?? [];
		if (
			(!room.memory[RMEM.DEPOSITS].length &&
				room.deposits.length !== 0) ||
			room.memory[RMEM.DEPOSITS].length !== room.deposits.length
		) {
			room.memory[RMEM.DEPOSITS] = room.deposits.map((deposit) => {
				const dpst: SavedDeposit = {
					c: packCoord(deposit.pos),
					[RMEM_DPST.DEPOSITTYPE]: deposit.depositType,
					[RMEM_DPST.COOLDOWN]: deposit.lastCooldown,
					[RMEM_DPST.TTL]: deposit.ticksToDecay,
					[RMEM_DPST.TIME]: Game.time,
				};
				return dpst;
			});
		}
	}

	private static recordOwnedRoomStructures(room: Room) {
		if ((room.controller && room.controller.owner) || room.invaderCore) {
			room.memory[RMEM.IMPORTANT_STRUCTURES] = {
				[RMEM_STRUCTS.TOWERS]: packCoordList(
					_.map(room.towers, (t) => t.pos)
				),
				[RMEM_STRUCTS.SPAWNS]: packCoordList(
					_.map(room.spawns, (s) => s.pos)
				),
				[RMEM_STRUCTS.WALLS]: packCoordList(
					_.map(room.walls, (w) => w.pos)
				),
				[RMEM_STRUCTS.RAMPARTS]: packCoordList(
					_.map(room.ramparts, (r) => r.pos)
				),
				[RMEM_STRUCTS.STORAGE]:
					room.storage ? packCoord(room.storage.pos) : undefined,
				[RMEM_STRUCTS.TERMINAL]:
					room.terminal ? packCoord(room.terminal.pos) : undefined,
			};
		} else {
			delete room.memory[RMEM.IMPORTANT_STRUCTURES];
		}
	}

	private static recordPortalInfo(room: Room) {
		if (room.portals.length > 0) {
			room.memory[RMEM.PORTALS] = _.map(room.portals, (portal) => {
				const dest =
					portal.destination instanceof RoomPosition ?
						packPos(portal.destination)
					:	portal.destination;
				const expiration =
					portal.ticksToDecay != undefined ?
						Game.time + portal.ticksToDecay
					:	Game.time + 1000000;
				return {
					c: packCoord(portal.pos),
					dest: dest,
					[MEM.EXPIRATION]: expiration,
				};
			});
			if (!this.memory.portalRooms.includes(room.name)) {
				this.memory.portalRooms.push(room.name);
			}
		} else {
			delete room.memory[RMEM.PORTALS];
			_.pull(this.memory.portalRooms, room.name);
		}
	}

	/**
	 * Update time-sensitive reservation and safemode info
	 */
	private static recordControllerInfo(controller: StructureController): void {
		const savedController = controller.room.memory[RMEM.CONTROLLER];
		if (savedController) {
			savedController[RMEM_CTRL.RESERVATION] =
				controller.reservation ?
					{
						[RMEM_CTRL.RES_USERNAME]:
							controller.reservation.username,
						[RMEM_CTRL.RES_TICKSTOEND]:
							controller.reservation.ticksToEnd,
					}
				:	undefined;
			savedController[RMEM_CTRL.SAFEMODE] = controller.safeMode;
			savedController[RMEM_CTRL.SAFEMODE_COOLDOWN] =
				controller.safeModeCooldown;
		}
	}

	static inSafeMode(roomName: string): boolean {
		if (
			!!Memory.rooms[roomName] &&
			!!Memory.rooms[roomName][RMEM.CONTROLLER]
		) {
			const safemode =
				Memory.rooms[roomName][RMEM.CONTROLLER]![RMEM_CTRL.SAFEMODE];
			const tick = Memory.rooms[roomName][MEM.EXPIRATION];
			if (safemode && tick) {
				return Game.time < tick + safemode;
			}
		}
		return false;
	}

	static safeModeCooldown(roomName: string): number | undefined {
		if (
			Memory.rooms[roomName] &&
			Memory.rooms[roomName][RMEM.CONTROLLER] &&
			Memory.rooms[roomName][RMEM.CONTROLLER]![
				RMEM_CTRL.SAFEMODE_COOLDOWN
			]
		) {
			const smcooldown =
				Memory.rooms[roomName][RMEM.CONTROLLER]![
					RMEM_CTRL.SAFEMODE_COOLDOWN
				];
			const tick = Memory.rooms[roomName][MEM.EXPIRATION];
			if (smcooldown && tick) {
				return smcooldown - (Game.time - tick);
			}
		}
	}

	private static recomputeScoreIfNecessary(
		roomName: string,
		force = false
	): boolean {
		if (force) {
			return ExpansionEvaluator.computeExpansionData(roomName, true);
		}
		const memory = Memory.rooms[roomName];
		if (memory[RMEM.EXPANSION_DATA] === 0) {
			// room is uninhabitable or owned
			if (Math.random() < FALSE_SCORE_RECALC_PROB) {
				// false scores get evaluated very occasionally
				return ExpansionEvaluator.computeExpansionData(roomName);
			}
		} else {
			// if the room is not uninhabitable
			if (
				!memory[RMEM.EXPANSION_DATA] ||
				Math.random() < SCORE_RECALC_PROB
			) {
				// recompute some of the time
				return ExpansionEvaluator.computeExpansionData(roomName);
			}
		}
		return false;
	}

	private static updateInvasionData(room: Room): void {
		if (!room.memory[RMEM.INVASION_DATA]) {
			room.memory[RMEM.INVASION_DATA] = {
				[RMEM_INVASION.HARVESTED]: 0,
				[RMEM_INVASION.LAST_SEEN]: 0,
			};
		}
		const sources = room.sources;
		const invasionData = room.memory[RMEM.INVASION_DATA];
		for (const source of sources) {
			if (source.ticksToRegeneration == 1) {
				invasionData[RMEM_INVASION.HARVESTED] +=
					source.energyCapacity - source.energy;
			}
		}
		if (room.invaders.length > 0) {
			invasionData[RMEM_INVASION.HARVESTED] = 0;
			invasionData[RMEM_INVASION.LAST_SEEN] = Game.time;
		}
	}

	// private static updateHarvestData(room: Room): void {
	// 	if (!room.memory[RMEM.HARVEST]) {
	// 		room.memory[RMEM.HARVEST] = {
	// 			[MEM_AVGS.AMOUNT] : 0,
	// 			[MEM_AVGS.AVG10K] : _.sum(room.sources, s => s.energyCapacity / ENERGY_REGEN_TIME),
	// 			[MEM_AVGS.AVG100K]: _.sum(room.sources, s => s.energyCapacity / ENERGY_REGEN_TIME),
	// 			[MEM_AVGS.AVG1M]  : _.sum(room.sources, s => s.energyCapacity / ENERGY_REGEN_TIME),
	// 			[MEM.TICK]             : Game.time,
	// 		};
	// 	}
	// 	const harvest = room.memory[RMEM.HARVEST] as RollingStats;
	// 	for (const source of room.sources) {
	// 		if (source.ticksToRegeneration == 1) {
	// 			const dEnergy = source.energyCapacity - source.energy;
	// 			const dTime = Game.time - harvest[MEM.TICK] + 1; // +1 to avoid division by zero errors
	// 			harvest[MEM_AVGS.AMOUNT] += dEnergy;
	// 			harvest[MEM_AVGS.AVG10K] = +(irregularExponentialMovingAverage(
	// 				dEnergy / dTime, harvest[MEM_AVGS.AVG10K], dTime, 10000)).toFixed(7);
	// 			harvest[MEM_AVGS.AVG100K] = +(irregularExponentialMovingAverage(
	// 				dEnergy / dTime, harvest[MEM_AVGS.AVG100K], dTime, 100000)).toFixed(7);
	// 			harvest[MEM_AVGS.AVG1M] = +(irregularExponentialMovingAverage(
	// 				dEnergy / dTime, harvest[MEM_AVGS.AVG1M], dTime, 1000000)).toFixed(7);
	// 			harvest[MEM.TICK] = Game.time;
	// 		}
	// 	}
	// }

	// private static updateCasualtyData(room: Room): void {
	// 	if (!room.memory[RMEM.CASUALTIES]) {
	// 		room.memory[RMEM.CASUALTIES] = {
	// 			cost: {
	// 				[MEM_AVGS.AMOUNT] : 0,
	// 				[MEM_AVGS.AVG10K] : 0,
	// 				[MEM_AVGS.AVG100K]: 0,
	// 				[MEM_AVGS.AVG1M]  : 0,
	// 				[MEM.TICK]             : Game.time,
	// 			}
	// 		};
	// 	}
	// 	const casualtiesCost = room.memory[RMEM.CASUALTIES]!.cost as RollingStats;
	// 	for (const tombstone of room.tombstones) {
	// 		if (tombstone.ticksToDecay == 1) {
	// 			// record any casualties, which are my creeps which died prematurely
	// 			if ((tombstone.creep.ticksToLive || 0) > 1 && tombstone.creep.owner.username == MY_USERNAME
	// 				&& isCreep(tombstone.creep)) {
	// 				const body = _.map(tombstone.creep.body, part => part.type);
	// 				const lifetime = body.includes(CLAIM) ? CREEP_CLAIM_LIFE_TIME : CREEP_LIFE_TIME;
	// 				const dCost = bodyCost(body) * (tombstone.creep.ticksToLive || 0) / lifetime;
	// 				const dTime = Game.time - casualtiesCost[MEM.TICK] + 1;
	// 				casualtiesCost[MEM_AVGS.AMOUNT] += dCost;
	// 				casualtiesCost[MEM_AVGS.AVG10K] = +(irregularExponentialMovingAverage(
	// 					dCost / dTime, casualtiesCost[MEM_AVGS.AVG10K], dTime, 10000)).toFixed(7);
	// 				casualtiesCost[MEM_AVGS.AVG100K] = +(irregularExponentialMovingAverage(
	// 					dCost / dTime, casualtiesCost[MEM_AVGS.AVG100K], dTime, 100000)).toFixed(7);
	// 				casualtiesCost[MEM_AVGS.AVG1M] = +(irregularExponentialMovingAverage(
	// 					dCost / dTime, casualtiesCost[MEM_AVGS.AVG1M], dTime, 1000000)).toFixed(7);
	// 				casualtiesCost[MEM.TICK] = Game.time;
	// 			}
	// 		}
	// 	}
	// }

	static getExitPositions(roomName: string): RoomPosition[] {
		const terrain = Game.map.getRoomTerrain(roomName);
		const exitPositions: RoomPosition[] = [];

		for (let x = 0; x < 50; x += 49) {
			for (let y = 0; y < 50; y++) {
				if (terrain.get(x, y) != TERRAIN_MASK_WALL) {
					exitPositions.push(new RoomPosition(x, y, roomName));
				}
			}
		}
		for (let x = 0; x < 50; x++) {
			for (let y = 0; y < 50; y += 49) {
				if (terrain.get(x, y) != TERRAIN_MASK_WALL) {
					exitPositions.push(new RoomPosition(x, y, roomName));
				}
			}
		}

		return exitPositions;
	}

	/**
	 * Get the pos a creep was in on the previous tick, returning the same position as the creep if no data was
	 * gathered on the previous tick.
	 */
	static getPreviousPos(creep: Creep): RoomPosition {
		const prevPositions = creep.room.memory[RMEM.PREV_POSITIONS];
		if (prevPositions) {
			const packedId = packId(creep.id);
			if (prevPositions[packedId]) {
				return unpackCoordAsPos(
					prevPositions[packedId],
					creep.room.name
				);
			}
		}
		return creep.pos; // no data
	}

	private static recordCreepPositions(room: Room): void {
		const positions: { [packedCreepId: string]: string } = {};
		for (const creep of room.find(FIND_CREEPS)) {
			positions[packId(creep.id)] = packCoord(creep.pos);
		}
		room.memory[RMEM.PREV_POSITIONS] = {};
	}

	// private static recordCreepOccupancies(room: Room): void {
	// 	if (!room.memory[RMEM.CREEPS_IN_ROOM]) {
	// 		room.memory[RMEM.CREEPS_IN_ROOM] = {};
	// 	}
	// 	const creepsInRoom = room.memory[RMEM.CREEPS_IN_ROOM]!;
	// 	for (const tick in creepsInRoom) {
	// 		if (parseInt(tick, 10) < Game.time - ROOM_CREEP_HISTORY_TICKS) {
	// 			delete creepsInRoom[tick];
	// 		}
	// 	}
	// 	creepsInRoom[Game.time] = _.map(room.hostiles, creep => creep.name);
	// }

	/**
	 * Records threat levels, visibility, consecutive safe/unsafe ticks and other data on visible or invisible rooms.
	 * Must be run in RoomIntel.init(), as it populates several room properties used elsewhere // TODO: expensive
	 */
	private static recordSafety(roomName: string): void {
		// Make sure the memory objects are there
		Memory.rooms[roomName] = Memory.rooms[roomName] || {};
		Memory.rooms[roomName][RMEM.SAFETY] = Memory.rooms[roomName][
			RMEM.SAFETY
		] || {
			[RMEM_SAFETY.THREAT_LEVEL]: 0,
			[RMEM_SAFETY.SAFE_FOR]: 0,
			[RMEM_SAFETY.UNSAFE_FOR]: 0,
			[RMEM_SAFETY.INVISIBLE_FOR]: 0,
		};

		const safetyData = Memory.rooms[roomName][
			RMEM.SAFETY
		] as SavedSafetyData;
		const room = Game.rooms[roomName] as Room | undefined;

		if (room) {
			safetyData[RMEM_SAFETY.INVISIBLE_FOR] = 0;
			if (room.dangerousHostiles.length > 0) {
				safetyData[RMEM_SAFETY.SAFE_FOR] = 0;
				safetyData[RMEM_SAFETY.UNSAFE_FOR] += 1;
			} else {
				safetyData[RMEM_SAFETY.SAFE_FOR] += 1;
				safetyData[RMEM_SAFETY.UNSAFE_FOR] = 0;
			}
			if (room.my || room.isOutpost) {
				// Record combat potentials of creeps in room
				const potentials = CombatIntel.getCombatPotentials(
					room.dangerousPlayerHostiles
				);
				safetyData[RMEM_SAFETY.COMBAT_POTENTIALS] = {
					[COMBAT_POTENTIALS.ATTACK]: potentials.attack,
					[COMBAT_POTENTIALS.RANGED]: potentials.ranged,
					[COMBAT_POTENTIALS.HEAL]: potentials.heal,
				};
				if (potentials.dismantle) {
					safetyData[RMEM_SAFETY.COMBAT_POTENTIALS][
						COMBAT_POTENTIALS.DISMANTLE
					] = potentials.dismantle;
				}

				// Record hostile counts
				safetyData[RMEM_SAFETY.NUM_HOSTILES] = room.hostiles.length; // this records ALL hostiles!
				safetyData[RMEM_SAFETY.NUM_BOOSTED_HOSTILES] = _.filter(
					room.hostiles,
					(hostile) => hostile.boosts.length > 0
				).length;
			} else {
				delete safetyData[RMEM_SAFETY.COMBAT_POTENTIALS];
				delete safetyData[RMEM_SAFETY.NUM_HOSTILES];
				delete safetyData[RMEM_SAFETY.NUM_BOOSTED_HOSTILES];
			}
		} else {
			safetyData[RMEM_SAFETY.INVISIBLE_FOR] += 1;
		}

		// Instantaneous threat level for a room scales from 0 to 1, with presence from non-player hostiles capped at
		// a threat levle of 0.5.
		let instantaneousThreatLevel: 0 | 0.5 | 1;
		if (!room) {
			instantaneousThreatLevel = 0.5;
		} else {
			if (room.controller && room.controller.safeMode) {
				instantaneousThreatLevel = 0;
			} else {
				if (room.dangerousPlayerHostiles.length > 0) {
					instantaneousThreatLevel = 1;
				} else if (room.dangerousHostiles.length > 0) {
					instantaneousThreatLevel = 0.5;
				} else {
					instantaneousThreatLevel = 0;
				}
			}
		}

		// Average it over time, using different averaging windows depending on the scenario
		const numBoostedHostiles =
			safetyData[RMEM_SAFETY.NUM_BOOSTED_HOSTILES] || 0;
		switch (instantaneousThreatLevel) {
			case 0:
				safetyData[RMEM_SAFETY.THREAT_LEVEL] = ema(
					instantaneousThreatLevel,
					safetyData[RMEM_SAFETY.THREAT_LEVEL],
					CREEP_LIFE_TIME / 2
				);
				break;
			case 0.5:
				safetyData[RMEM_SAFETY.THREAT_LEVEL] = ema(
					instantaneousThreatLevel,
					safetyData[RMEM_SAFETY.THREAT_LEVEL],
					CREEP_LIFE_TIME / (1 + numBoostedHostiles)
				);
				break;
			case 1:
				safetyData[RMEM_SAFETY.THREAT_LEVEL] = ema(
					instantaneousThreatLevel,
					safetyData[RMEM_SAFETY.THREAT_LEVEL],
					CREEP_LIFE_TIME / (4 + numBoostedHostiles)
				);
				break;
		}

		// // Compute rolling averages
		// const dTime = Game.time - safetyData[RMEM_SAFETY.TICK];
		// safetyData[RMEM_SAFETY.SAFETY_1K] = +(irregularEma(
		// 	safety, safetyData[RMEM_SAFETY.SAFETY_1K], dTime, 1000)).toFixed(5);
		// safetyData[RMEM_SAFETY.SAFETY_10K] = +(irregularEma(
		// 	safety, safetyData[RMEM_SAFETY.SAFETY_10K], dTime, 10000)).toFixed(5);

		// Populate the per-tick properties on the room object itself
		if (room) {
			room.instantaneousThreatLevel = instantaneousThreatLevel;
			room.threatLevel = safetyData[RMEM_SAFETY.THREAT_LEVEL];
			room.isSafe =
				room.instantaneousThreatLevel <=
					(Memory.settings.attitude.brazenness ?? 0.5) &&
				(room.threatLevel < 0.15 ||
					safetyData[RMEM_SAFETY.SAFE_FOR] > 50);
		}
	}

	static getSafetyData(roomName: string) {
		const data = <SavedSafetyData>(
			(Memory.rooms[roomName]?.[RMEM.SAFETY] ?? {})
		);
		return <SafetyData>{
			threatLevel: data[RMEM_SAFETY.THREAT_LEVEL] ?? 0.5,
			safeFor: data[RMEM_SAFETY.SAFE_FOR] ?? NaN,
			unsafeFor: data[RMEM_SAFETY.UNSAFE_FOR] ?? NaN,
			invisibleFor: data[RMEM_SAFETY.INVISIBLE_FOR] ?? NaN,
			combatPotentials: data[RMEM_SAFETY.COMBAT_POTENTIALS] ?? NaN,
			numHostiles: data[RMEM_SAFETY.NUM_HOSTILES] ?? NaN,
			numBoostedHostiles: data[RMEM_SAFETY.NUM_BOOSTED_HOSTILES] ?? NaN,
		};
	}

	static getInvasionData(roomName: string): InvasionData | undefined {
		const memory = Memory.rooms[roomName];
		if (!memory) {
			return undefined;
		}
		const data = memory[RMEM.INVASION_DATA];
		if (!data) {
			return undefined;
		}
		return <InvasionData>{
			harvested: data[RMEM_INVASION.HARVESTED],
			lastSeen: data[RMEM_INVASION.LAST_SEEN],
		};
	}

	static isInvasionLikely(roomName: string): boolean {
		const data = this.getInvasionData(roomName);
		if (!data || data.lastSeen > 20000) {
			// maybe room is surrounded by owned/reserved rooms and invasions aren't possible
			return false;
		}
		const sources = this.getSourceInfo(roomName);
		switch (sources!.length) {
			case 1:
				return data.harvested > 90000;
			case 2:
				return data.harvested > 75000;
			case 3:
				return data.harvested > 65000;
			default: // shouldn't ever get here
				return false;
		}
	}

	static invasionVisualsForRoom(roomName: string): void {
		const invIntel = this.getInvasionData(roomName);
		if (invIntel) {
			const { harvested, lastSeen } = invIntel;
			const invasionLikely = this.isInvasionLikely(roomName);

			const invData = [];
			invData.push(["Harvested:", `${harvested}`]);
			invData.push(["Last seen:", `${Game.time - lastSeen}t ago`]);
			invData.push([
				"Invasion likely:",
				`${invasionLikely ? "yes" : "no"}`,
			]);

			const boxY = 11;
			Visualizer.infoBox(
				`Invasion Data`,
				invData,
				{ x: 1, y: boxY, roomName },
				9
			);
		}
	}

	static roomOwnedBy(roomName: string): string | undefined {
		if (
			Memory.rooms[roomName] &&
			Memory.rooms[roomName][RMEM.CONTROLLER] &&
			Memory.rooms[roomName][RMEM.CONTROLLER]![RMEM_CTRL.OWNER]
		) {
			if (Game.time - (Memory.rooms[roomName][MEM.TICK] || 0) < 25000) {
				// ownership expires after 25k ticks
				return Memory.rooms[roomName][RMEM.CONTROLLER]![
					RMEM_CTRL.OWNER
				];
			}
		}
	}

	static roomReservedBy(roomName: string): string | undefined {
		if (
			Memory.rooms[roomName] &&
			Memory.rooms[roomName][RMEM.CONTROLLER] &&
			Memory.rooms[roomName][RMEM.CONTROLLER]![RMEM_CTRL.RESERVATION]
		) {
			if (Game.time - (Memory.rooms[roomName][MEM.TICK] || 0) < 10000) {
				// reservation expires after 10k ticks
				return Memory.rooms[roomName][RMEM.CONTROLLER]![
					RMEM_CTRL.RESERVATION
				]![RMEM_CTRL.RES_USERNAME];
			}
		}
	}

	static roomReservationRemaining(roomName: string): number {
		if (
			Memory.rooms[roomName] &&
			Memory.rooms[roomName][RMEM.CONTROLLER] &&
			Memory.rooms[roomName][RMEM.CONTROLLER]![RMEM_CTRL.RESERVATION]
		) {
			const ticksToEnd =
				Memory.rooms[roomName][RMEM.CONTROLLER]![
					RMEM_CTRL.RESERVATION
				]![RMEM_CTRL.RES_TICKSTOEND];
			const timeSinceLastSeen =
				Game.time - (Memory.rooms[roomName][MEM.TICK] || 0);
			return ticksToEnd - timeSinceLastSeen;
		}
		return 0;
	}

	/**
	 * Get the list of all known portals.
	 *
	 * @param includeIntershard Whether to include intershard portals
	 */
	static findAllPortals(includeIntershard = false) {
		const roomNames = [];
		for (const [name, mem] of entries(Memory.rooms)) {
			if (!mem[RMEM.PORTALS] || mem[RMEM.PORTALS].length === 0) {
				continue;
			}
			roomNames.push(name);
		}

		const portals = [];
		for (const roomName of roomNames) {
			let portalInfos = this.getPortalInfo(roomName);
			if (!includeIntershard) {
				portalInfos = portalInfos.filter((p) => p.roomDestination);
			}
			portals.push(...portalInfos);
		}
		return portals;
	}

	/**
	 * Returns the portals that are within a specified range of a colony indexed by their room
	 */
	static findPortalsInRange(
		roomName: string,
		range: number,
		includeIntershard = false
	): { [roomName: string]: PortalInfo[] } {
		const portals = this.findAllPortals(includeIntershard);

		const rooms: { [name: string]: PortalInfo[] } = {};
		for (const portal of portals) {
			if (
				Game.map.getRoomLinearDistance(roomName, portal.pos.roomName) >
				range
			) {
				continue;
			}
			rooms[roomName] ??= [];
			rooms[roomName].push(portal);
		}
		return rooms;
	}

	// static requestZoneData() {
	// 	const checkOnTick = 123;
	// 	if (Game.time % 1000 == checkOnTick - 2) {
	// 		Segmenter.requestForeignSegment('LeagueOfAutomatedNations', 96);
	// 	} else if (Game.time % 1000 == checkOnTick - 1) {
	// 		const loanData = Segmenter.getForeignSegment();
	// 		if (loanData) {
	// 			Memory.zoneRooms = loanData;
	// 		} else {
	// 			log.error('Empty LOAN data');
	// 		}
	// 	}
	// }

	/**
	 * Cached version of Game.map.getRoomStatus() which retrieves compressed status data and converts to RoomStatus
	 */
	static getRoomStatus(roomName: string): RoomStatus {
		Memory.rooms[roomName] = Memory.rooms[roomName] || {};
		// Recalculate if you haven't seen this room before or if the timestamp is expired
		if (
			!Memory.rooms[roomName][RMEM.ROOM_STATUS] ||
			new Date().getTime() >
				new Date(
					Memory.rooms[roomName][RMEM.ROOM_STATUS]![1] * 1000
				).getTime()
		) {
			let { status, timestamp } = Game.map.getRoomStatus(roomName);
			if (timestamp == null) {
				// null timestamp means indefinite, but not really; let's recheck in a few days
				const extraMilliseconds = 3 * 24 * 60 * 60 * 1000; // check again in 3 days
				timestamp = new Date().getTime() + extraMilliseconds;
			}
			timestamp = Math.floor(timestamp / 1000); // don't need milliseconds; seconds will do
			switch (status) {
				case "normal":
					Memory.rooms[roomName][RMEM.ROOM_STATUS] = [
						RMEM_ROOM_STATUS.normal,
						timestamp,
					];
					break;
				case "closed":
					Memory.rooms[roomName][RMEM.ROOM_STATUS] = [
						RMEM_ROOM_STATUS.closed,
						timestamp,
					];
					break;
				case "novice":
					Memory.rooms[roomName][RMEM.ROOM_STATUS] = [
						RMEM_ROOM_STATUS.novice,
						timestamp,
					];
					break;
				case "respawn":
					Memory.rooms[roomName][RMEM.ROOM_STATUS] = [
						RMEM_ROOM_STATUS.respawn,
						timestamp,
					];
					break;
			}
		}
		const [statusCompressed, timestampCompressed] =
			Memory.rooms[roomName][RMEM.ROOM_STATUS]!;
		const timestamp = timestampCompressed * 1000;
		switch (statusCompressed) {
			case RMEM_ROOM_STATUS.normal:
				return { status: "normal", timestamp: null };
			case RMEM_ROOM_STATUS.closed:
				return { status: "closed", timestamp: null };
			case RMEM_ROOM_STATUS.novice:
				return { status: "novice", timestamp: timestamp };
			case RMEM_ROOM_STATUS.respawn:
				return { status: "respawn", timestamp: timestamp };
		}
	}

	/**
	 * Returns whether the room should be considered hostile
	 */
	static isConsideredHostile(
		roomName: string,
		cutoffOrBrazen?: boolean | number
	) {
		const roomD = this.getAllRoomObjectInfo(roomName);
		const safety = this.getSafetyData(roomName);

		if (cutoffOrBrazen === true) {
			cutoffOrBrazen = 1.0;
		} else if (cutoffOrBrazen === false) {
			cutoffOrBrazen = Memory.settings.attitude.brazenness ?? 0.5;
		} else if (typeof cutoffOrBrazen === "number") {
			cutoffOrBrazen = minMax(cutoffOrBrazen, 0, 1);
		} else {
			cutoffOrBrazen = Memory.settings.attitude.brazenness ?? 0.5;
		}

		return (
			!isAlly(roomD?.controller?.owner ?? "") &&
			safety.threatLevel > cutoffOrBrazen
		);
	}

	/**
	 * Returns a room's available exits
	 *
	 * This wraps {@link Cartographer.describeExits} method and adds exit info for
	 * known portals in the room.
	 *
	 * @param roomName The room name to check
	 * @returns
	 */
	static describeExits(
		roomName: string,
		allowPortals?: "interOnly" | boolean
	): RoomExits {
		const exits: RoomExits = Cartographer.describeExits(roomName);
		if (!exits) {
			return exits;
		}
		const radius = Math.ceil(Game.map.getWorldSize() / 2) - 1;
		const coord = Cartographer.getRoomCoordinates(roomName);
		if (coord.x >= radius) {
			const xDirToMoveDir = coord.xDir === "W" ? 7 : 3;
			delete exits[xDirToMoveDir];
		}
		if (coord.y >= radius) {
			const yDirToMoveDir = coord.xDir === "N" ? 1 : 5;
			delete exits[yDirToMoveDir];
		}

		if (allowPortals) {
			let portals = this.getPortalInfo(roomName);
			if (portals) {
				if (allowPortals === "interOnly") {
					portals = portals.filter(
						(portal) => portal.roomDestination
					);
				}

				exits[FIND_EXIT_PORTAL] = portals;
			}
		}

		return exits;
	}

	/**
	 * RoomIntel.init() is the very first thing that is run in the init phase of each tick. The only stuff that should
	 * go in here is critical and inexpensive stuff that is necessary information for this tick.
	 */
	static init(): void {
		for (const roomName in Game.rooms) {
			Memory.rooms[roomName] = Memory.rooms[roomName] || {};
		}

		for (const roomName in Memory.rooms) {
			const room: Room | undefined = Game.rooms[roomName];

			this.recordSafety(roomName);
			if (room) {
				this.markVisible(room);
			}
		}
	}

	/**
	 * RoomIntel.run() is the very last thing that is run in the run phase of each tick. If something times out earlier
	 * in the script, then this will not be fully executed, so do not put critical stuff here.
	 */
	static run(): void {
		let alreadyComputedScore = false;

		for (const roomName in Game.rooms) {
			// log.debug(`${roomName}: collecting intel`);

			const room: Room = Game.rooms[roomName];

			// Track invasion data, harvesting, and casualties for all colony rooms and outposts
			if (Overmind.colonyMap[room.name]) {
				// if it is an owned or outpost room
				this.updateInvasionData(room);
				// this.updateHarvestData(room);
				// this.updateCasualtyData(room);
			}

			// Record previous creep positions (RoomIntel.run() is executed at end of each tick)
			this.recordCreepPositions(room);
			// if (room.my) {
			// 	this.recordCreepOccupancies(room);
			// }

			if (
				Game.time % 50 === 0 ||
				room.memory[RMEM.DEPOSITS] === undefined
			) {
				this.recordDepositsInfo(room);
			}

			// Record location of permanent objects in room and recompute score as needed
			if (Game.time >= (room.memory[MEM.EXPIRATION] || 0)) {
				this.recordPermanentObjects(room);
				if (!alreadyComputedScore) {
					alreadyComputedScore = this.recomputeScoreIfNecessary(
						room.name
					);
				}
				// Refresh cache
				const recacheTime =
					room.owner ? OWNED_RECACHE_TIME : RECACHE_TIME;
				room.memory[MEM.EXPIRATION] = getCacheExpiration(
					recacheTime,
					250
				);
			}

			if (room.controller && Game.time % 5 == 0) {
				this.recordControllerInfo(room.controller);
			}
		}

		if (Game.time % 20 == 0) {
			this.cleanMemory();
		}
	}

	static limitedRoomVisual: Set<string> | undefined;

	private static drawMapVisuals(roomName: string) {
		const exp = RoomIntel.getExpansionData(roomName);
		const sec = RoomIntel.getSafetyData(roomName);
		const objs = RoomIntel.getAllRoomObjectInfo(roomName);
		const threatColor = interpolateColor(
			"#00FF00",
			"#FF0000",
			sec.threatLevel
		);
		Game.map.visual.rect(new RoomPosition(2, 2, roomName), 4, 4, {
			fill: threatColor,
			stroke: "#FFFFFF",
			opacity: 1,
		});

		if (roomName in Game.rooms) {
			Game.map.visual.circle(new RoomPosition(4 + 4 + 2, 4, roomName), {
				radius: 2,
				fill: "#00CCCC",
				stroke: "#000000",
			});
		}

		const expPos = new RoomPosition(45, 5, roomName);
		const expSize = 10;
		if (objs?.controller === undefined && exp === undefined) {
			Game.map.visual.text("?", expPos, {
				fontSize: expSize,
				color: "#AAAAAA",
			});
		} else if (exp === undefined) {
			Game.map.visual.text("!", expPos, {
				fontSize: expSize,
				color: "#FFFF00",
			});
		} else if (exp === false) {
			Game.map.visual.text("X", expPos, {
				fontSize: expSize,
				color: "#FF0000",
			});
		} else {
			Game.map.visual.text("🏠", expPos, { fontSize: expSize });
			Game.map.visual.text(
				exp.score.toFixed(0),
				new RoomPosition(48, 14, roomName),
				{ fontSize: 4, color: "#00FF00", align: "right" }
			);
		}
	}

	private static drawRoomVisuals(roomName: string) {
		const expData = [];

		const exp = RoomIntel.getExpansionData(roomName);
		const objs = RoomIntel.getAllRoomObjectInfo(roomName);

		if (objs?.controller === undefined && exp === undefined) {
			expData.push(["Incomplete"]);
		} else if (exp === undefined) {
			expData.push(["Incomplete"]);
		} else if (exp === false) {
			expData.push(["Uninhabitable"]);
		} else {
			expData.push(["Score", exp.score.toFixed(0)]);
			expData.push([
				"Anchor",
				`${exp.bunkerAnchor.x}, ${exp.bunkerAnchor.y}`,
			]);
			expData.push(["Outposts:"]);
			if (_.keys(exp.outposts).length !== 0) {
				for (const outpost in exp.outposts) {
					expData.push([outpost, exp.outposts[outpost].toString()]);
				}
			}
		}

		let boxY = 7;
		boxY = Visualizer.infoBox(
			`Expansion`,
			expData,
			{ x: 40, y: boxY, roomName: roomName },
			6
		);

		const objData = [];
		// Room objects
		if (objs?.controller) {
			const c = objs.controller;
			if (c.owner) {
				objData.push(["Controller"]);
				objData.push([` ${c.owner}@${c.level}`]);
				if (c.level !== 8 && c.progressTotal) {
					objData.push([
						"Progress",
						`${((c.progress! / c.progressTotal) * 100).toFixed(
							1
						)}%`,
					]);
				}
			}
			if (c.reservation) {
				objData.push([
					"Reserved",
					`${c.reservation.username} until ${c.reservation.ticksToEnd}`,
				]);
			}
		}
		if (objs?.sources.length) {
			objData.push(["Sources", `${objs.sources.length}`]);
		}
		if (objs?.mineral) {
			objData.push([
				"Mineral",
				`${objs.mineral.mineralType}@${objs.mineral.density}`,
			]);
		}
		if (objs?.importantStructures) {
			const s = objs.importantStructures;
			objData.push(["Structures:"]);
			if (s.spawnPositions.length) {
				objData.push(["Spawns", `${s.spawnPositions.length}`]);
			}
			if (s.storagePos) {
				objData.push(["Storage", `Yes`]);
			}
			if (s.terminalPos) {
				objData.push(["Terminal", `Yes`]);
			}
			if (s.towerPositions.length) {
				objData.push(["Towers", `${s.towerPositions.length}`]);
			}
			if (s.rampartPositions.length + s.rampartPositions.length) {
				objData.push([
					"Walls/Ramp.",
					`${s.wallPositions.length}/${s.rampartPositions.length}`,
				]);
			}
		}
		if (!objData.length) {
			objData.push(["Unexplored"]);
		}
		boxY = Visualizer.infoBox(
			`Structures`,
			objData,
			{ x: 40, y: boxY, roomName: roomName },
			8
		);

		<any>boxY;
	}

	static visuals(): void {
		const until = Memory.settings.intelVisuals.until;
		if (!Visualizer.enabled || until === undefined || Game.time > until) {
			this.limitedRoomVisual = undefined;
			return;
		}

		if (!this.limitedRoomVisual) {
			this.limitedRoomVisual = new Set();
			const range =
				Memory.settings.intelVisuals.range ??
				ROOMINTEL_DEFAULT_VISUALS_RANGE;
			for (const colony of Object.values(Overmind.colonies)) {
				let rooms = Cartographer.findRoomsInRange(
					colony.room.name,
					range
				);
				const scouts = colony.overlords.scout?.scouts ?? [];
				rooms = rooms.concat(
					_.flatten(
						scouts.map((s) =>
							Cartographer.findRoomsInRange(s.room.name, range)
						)
					)
				);

				for (const name of rooms) {
					this.limitedRoomVisual?.add(name);
				}
			}
		}

		for (const [name, _name] of this.limitedRoomVisual.entries()) {
			if (!Memory.rooms[name]) {
				continue;
			}

			this.drawMapVisuals(name);
			this.drawRoomVisuals(name);
		}
	}
}

// For debugging purposes
global.RoomIntel = RoomIntel;
