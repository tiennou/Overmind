import { RoomIntelMemory } from "intel/RoomIntel";
import { log } from "../console/log";
import { profile } from "../profiler/decorator";
import { Stats } from "../stats/stats";
import { ema, isIVM } from "../utilities/utils";
import { SegmenterMemory } from "./Segmenter";
import { DebuggerMemory } from "debug/remoteDebugger";
import { CombatPlannerMemory } from "strategy/CombatPlanner";
import { NukePlannerMemory } from "strategy/NukePlanner";
import { config } from "config";

export enum Autonomy {
	Manual = 0,
	SemiAutomatic = 1,
	Automatic = 2,
}

export function getAutonomyLevel(): Autonomy {
	switch (Memory.settings.operationMode) {
		case "manual":
			return Autonomy.Manual;
		case "semiautomatic":
			return Autonomy.SemiAutomatic;
		case "automatic":
			return Autonomy.Automatic;
		default:
			log.warning(
				`ERROR: ${Memory.settings.operationMode} is not a valid operation mode! ` +
					`Defaulting to ${config.DEFAULT_OPERATION_MODE}; use setMode() to change.`
			);
			Memory.settings.operationMode = config.DEFAULT_OPERATION_MODE;
			return getAutonomyLevel();
	}
}

let lastMemory: Memory;
let lastTime: number = 0;

export const MAX_BUCKET = 10000;
const HEAP_CLEAN_FREQUENCY = 200;
const BUCKET_CLEAR_CACHE = 7000;
const BUCKET_CPU_HALT = 4000;
const BUCKET_LOW_WATERMARK = 500;
const PIXEL_GENERATION_GRACE_PERIOD = 500;

export const OVERMIND_SMALL_CAPS =
	"\u1D0F\u1D20\u1D07\u0280\u1D0D\u026A\u0274\u1D05";
export const DEFAULT_OVERMIND_SIGNATURE = `«${OVERMIND_SMALL_CAPS}»`;

/**
 * This module contains a number of low-level memory clearing and caching functions
 */
@profile
export class Mem {
	static shouldRun(): boolean {
		let shouldRun: boolean = true;
		if (!isIVM()) {
			log.warning(
				`Overmind requires isolated-VM to run. Change settings at screeps.com/a/#!/account/runtime`
			);
			shouldRun = false;
		}
		if (config.USE_SCREEPS_PROFILER && Game.time % 10 == 0) {
			log.warning(
				`Profiling is currently enabled; only ${config.PROFILER_COLONY_LIMIT} colonies will be run!`
			);
		}
		if (
			Game.cpu.bucket < BUCKET_LOW_WATERMARK &&
			(!Memory.pixelsTick ||
				Game.time - Memory.pixelsTick >= PIXEL_GENERATION_GRACE_PERIOD)
		) {
			if (
				_.keys(Game.spawns).length > 1 &&
				!Memory.resetBucket &&
				!Memory.haltTick
			) {
				// don't run CPU reset routine at very beginning or if it's already triggered
				log.warning(
					`CPU bucket is critically low (${Game.cpu.bucket})! Starting CPU reset routine.`
				);
				Memory.resetBucket = true;
				Memory.haltTick = Game.time + 1; // reset global next tick
			} else {
				log.info(
					`CPU bucket is too low (${Game.cpu.bucket}). Postponing operation until bucket reaches 500.`
				);
			}
			shouldRun = false;
		}
		if (Memory.resetBucket) {
			if (Game.cpu.bucket < MAX_BUCKET - Game.cpu.limit) {
				log.info(
					`Operation suspended until bucket recovery. Bucket: ${Game.cpu.bucket}/${MAX_BUCKET}`
				);
				shouldRun = false;
			} else {
				delete Memory.resetBucket;
			}
		}
		if (Memory.haltTick) {
			if (Memory.haltTick == Game.time) {
				if (Game.cpu.halt) {
					// this is undefined on non-IVM
					Memory.build--; // don't count this reset as a build
					Game.cpu.halt();
				}
				shouldRun = false;
			} else if (Memory.haltTick < Game.time) {
				delete Memory.haltTick;
			}
		}
		return shouldRun;
	}

	static didRun() {
		Memory.tick++;
		Memory.stats.persistent.time = Game.time;

		// Update bucket delta tracking
		const bucket = Game.cpu.bucket;
		const lastBucket = Memory.stats.persistent.lastBucket;
		if (lastBucket !== undefined) {
			const used = Game.cpu.getUsed();
			const limit = Game.cpu.shardLimits[Game.shard.name];

			// Since that (realistic) calculation will cap once the bucket is full
			// switch to an estimate based on CPU usage instead
			const delta = bucket - lastBucket;
			const deltaEstimate = Math.ceil(limit - used);

			const lastAvgDelta =
				Memory.stats.persistent.avgBucketDelta ?? bucket;
			const avgDelta = Math.min(
				ema(delta === 0 ? deltaEstimate : delta, lastAvgDelta, 10),
				limit
			);

			log.info(
				`CPU: used: ${used.toFixed(
					3
				)}, bucket: ${bucket} (delta: ${delta}, est: ${deltaEstimate}, avg: ${avgDelta.toFixed(
					0
				)}), tick limit: ${Game.cpu.tickLimit}`
			);
			Memory.stats.persistent.avgBucketDelta = avgDelta;
		}
		Memory.stats.persistent.lastBucket = bucket;
	}

	/**
	 * Attempt to load the parsed memory from a previous tick to avoid parsing costs
	 */
	static load() {
		if (lastTime && lastMemory && Game.time == lastTime + 1) {
			// @ts-expect-error global shenanigans
			delete global.Memory;
			global.Memory = lastMemory;
			RawMemory._parsed = lastMemory;
		} else {
			// eslint-disable-next-line
			Memory.rooms; // forces parsing
			// eslint-disable-next-line
			lastMemory = RawMemory._parsed;
			Memory.stats.persistent.lastMemoryReset = Game.time;
		}
		lastTime = Game.time;
		// Handle global time
		if (!global.GLOBAL_AGE) {
			global.GLOBAL_AGE = 0;
		}
		global.GLOBAL_AGE++;
		Memory.stats.persistent.globalAge = global.GLOBAL_AGE;
	}

	static garbageCollect(quick?: boolean) {
		if (global.gc) {
			// sometimes garbage collection isn't available
			const start = Game.cpu.getUsed();
			global.gc(quick);
			log.debug(
				`Running ${quick ? "quick" : "FULL"} garbage collection. ` +
					`Elapsed time: ${Game.cpu.getUsed() - start}.`
			);
		} else {
			log.debug(
				`Manual garbage collection is unavailable on this server.`
			);
		}
	}

	/**
	 * Wrap a parent memory object with a key name and set the default properties for the child memory object if needed
	 */
	static wrap<T extends object, D extends T[keyof T]>(
		memory: T,
		memName: keyof T,
		getDefaults: () => D = () => <D>{}
	): D {
		if (memory[memName] === undefined) {
			memory[memName] = getDefaults();
		} else if (Game.time == LATEST_GLOBAL_RESET_TICK) {
			// mem defaults would only change with a global reset
			memory[memName] = _.defaultsDeep(
				{},
				memory[memName],
				getDefaults()
			);
		}
		return <D>memory[memName];
	}

	private static _setDeep(object: any, keys: string[], value: any): void {
		const key = _.first(keys);
		keys = _.drop(keys);
		if (keys.length == 0) {
			// at the end of the recursion
			// eslint-disable-next-line
			object[key] = value;
			return;
		} else {
			if (!object[key]) {
				object[key] = {};
			}
			return Mem._setDeep(object[key], keys, value);
		}
	}

	/**
	 * Recursively set a value of an object given a dot-separated key, adding intermediate properties as necessary
	 * Ex: Mem.setDeep(Memory.colonies, 'E1S1.miningSites.siteID.stats.uptime', 0.5)
	 */
	static setDeep(object: any, keyString: string, value: any): void {
		const keys = keyString.split(".");
		return Mem._setDeep(object, keys, value);
	}

	private static getDefaultMemory(): Memory {
		return {
			tick: Game.time,
			build: 0,
			assimilator: {},
			Overmind: {},
			combatPlanner: <CombatPlannerMemory>{},
			profiler: {},
			overseer: {},
			segmenter: <SegmenterMemory>{},
			roomIntel: <RoomIntelMemory>{},
			colonies: {},
			rooms: {},
			creeps: {},
			powerCreeps: {},
			flags: {},
			spawns: {},
			pathing: { distances: {} },
			constructionSites: {},
			stats: { persistent: {} },
			playerCreepTracker: {},
			remoteDebugger: <DebuggerMemory>{},
			nukePlanner: <NukePlannerMemory>{},
			settings: {
				signature: DEFAULT_OVERMIND_SIGNATURE,
				operationMode: "automatic",
				log: {},
				enableVisuals: true,
				resourceCollectionMode: 0,
				allies: [],
				powerCollection: {
					enabled: false,
					maxRange: 5,
					minPower: 5000,
				},
				autoPoison: {
					enabled: false,
					maxRange: 4,
					maxConcurrent: 1,
				},
				pixelGeneration: {
					enabled: false,
				},
				roomPlanner: {
					allowDestroy: false,
				},
				colonization: {
					maxRooms: undefined,
				},
				intelVisuals: {},
				attitude: {
					brazenness: 0.5,
				},
			},
		};
	}

	static format() {
		// Format the memory as needed, done once every global reset
		_.defaultsDeep(
			Memory,
			{ settings: config.DEFAULT_SETTINGS },
			Mem.getDefaultMemory()
		);
		// Increment build counter (if global reset is due to CPU halt, the count will have been decremented)
		Memory.build++;
		// Make global memory
		this.initGlobalMemory();
	}

	private static initGlobalMemory() {
		const defaultGlobalCache: IGlobalCache = {
			accessed: {},
			expiration: {},
			structures: {},
			numbers: {},
			lists: {},
			costMatrices: {},
			roomPositions: {},
			things: {},
			objects: {},
		};
		global._cache = defaultGlobalCache;
	}

	static clean() {
		// Clean the memory of non-existent objects every tick
		this.cleanHeap();
		this.cleanCreeps();
		this.cleanFlags();
		this.cleanColonies();
		this.cleanPathingMemory();
		this.cleanConstructionSites();
		Stats.clean();
	}

	/**
	 * Attempt to clear some things out of the global heap to prevent increasing CPU usage
	 */
	private static cleanHeap(): void {
		if (Game.time % HEAP_CLEAN_FREQUENCY == HEAP_CLEAN_FREQUENCY - 3) {
			if (
				Game.cpu.bucket < BUCKET_CPU_HALT &&
				Game.cpu.halt !== undefined
			) {
				Memory.build--; // don't count this reset as a build
				Game.cpu.halt();
			} else if (Game.cpu.bucket < BUCKET_CLEAR_CACHE) {
				// @ts-expect-error global shenanigans
				delete global._cache;
				this.initGlobalMemory();
			}
		}
	}

	private static cleanCreeps() {
		// Clear memory for non-existent creeps
		for (const name in Memory.creeps) {
			if (!Game.creeps[name]) {
				delete Memory.creeps[name];
				// @ts-expect-error global shenanigans
				delete global[name];
			}
		}
	}

	private static cleanFlags() {
		// Clear memory for non-existent flags
		for (const name in Memory.flags) {
			if (!Game.flags[name]) {
				delete Memory.flags[name];
				// @ts-expect-error global shenanigans
				delete global[name];
			}
		}
	}

	private static cleanColonies() {
		// Clear memory of dead colonies
		for (const name in Memory.colonies) {
			const room = Game.rooms[name];
			if (!(room && room.my)) {
				// Delete only if "persistent" is not set - use case: praise rooms
				if (!Memory.colonies[name].persistent) {
					delete Memory.colonies[name];
					// @ts-expect-error global shenanigans
					delete global[name];
				}
			}
		}
	}

	private static cleanConstructionSites() {
		// Remove ancient construction sites
		if (Game.time % 20 == 0) {
			const CONSTRUCTION_SITE_TIMEOUT = 100000; // sites time out after this long
			const UNBUILT_CONSTRUCTION_SITE_TIMEOUT = 1000; // sites that haven't made any progress time out
			// Add constructionSites to memory and remove really old ones
			for (const id in Game.constructionSites) {
				const site = Game.constructionSites[id];
				if (!Memory.constructionSites[id]) {
					Memory.constructionSites[id] = Game.time;
				} else if (
					Game.time - Memory.constructionSites[id] >=
					CONSTRUCTION_SITE_TIMEOUT
				) {
					site.remove();
				} else if (
					site.progress == 0 &&
					Game.time - Memory.constructionSites[id] >=
						UNBUILT_CONSTRUCTION_SITE_TIMEOUT
				) {
					site.remove();
				}
				// Remove duplicate construction sites that get placed on top of existing structures due to caching
				if (
					site &&
					site.pos.isVisible &&
					site.pos.lookForStructure(site.structureType)
				) {
					site.remove();
				}
			}
			// Remove dead constructionSites from memory
			for (const id in Memory.constructionSites) {
				if (!Game.constructionSites[id]) {
					delete Memory.constructionSites[id];
				}
			}
		}
	}

	private static cleanPathingMemory() {
		const CLEAN_FREQUENCY = 5;
		if (Game.time % CLEAN_FREQUENCY == 0) {
			const distanceCleanProbability = 0.001 * CLEAN_FREQUENCY;
			const _weightedDistanceCleanProbability = 0.01 * CLEAN_FREQUENCY;

			// Randomly clear some cached path lengths
			for (const pos1Name in Memory.pathing.distances) {
				if (_.isEmpty(Memory.pathing.distances[pos1Name])) {
					delete Memory.pathing.distances[pos1Name];
				} else {
					for (const pos2Name in Memory.pathing.distances[pos1Name]) {
						if (Math.random() < distanceCleanProbability) {
							delete Memory.pathing.distances[pos1Name][pos2Name];
						}
					}
				}
			}

			// // Randomly clear weighted distances
			// for (const pos1Name in Memory.pathing.weightedDistances) {
			// 	if (_.isEmpty(Memory.pathing.weightedDistances[pos1Name])) {
			// 		delete Memory.pathing.weightedDistances[pos1Name];
			// 	} else {
			// 		for (const pos2Name in Memory.pathing.weightedDistances[pos1Name]) {
			// 			if (Math.random() < weightedDistanceCleanProbability) {
			// 				delete Memory.pathing.weightedDistances[pos1Name][pos2Name];
			// 			}
			// 		}
			// 	}
			// }
		}
	}
}
