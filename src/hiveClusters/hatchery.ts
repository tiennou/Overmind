import {
	ERR_ROOM_ENERGY_CAPACITY_NOT_ENOUGH,
	ERR_SPECIFIED_SPAWN_BUSY,
} from "utilities/errors";
import { $ } from "../caching/GlobalCache";
import { Colony, DEFCON } from "../Colony";
import { log } from "../console/log";
import { CombatCreepSetup } from "../creepSetups/CombatCreepSetup";
import { bodyCost, CreepSetup } from "../creepSetups/CreepSetup";
import { TransportRequestGroup } from "../logistics/TransportRequestGroup";
import { Mem } from "../memory/Memory";
import { Movement } from "../movement/Movement";
import { Pathing } from "../movement/Pathing";
import { QueenOverlord } from "../overlords/core/queen";
import { BunkerQueenOverlord } from "../overlords/core/queen_bunker";
import { Overlord } from "../overlords/Overlord";
import { Priority } from "../priorities/priorities";
import { profile } from "../profiler/decorator";
import {
	energyStructureOrder,
	getPosFromBunkerCoord,
	insideBunkerBounds,
} from "../roomPlanner/layouts/bunker";
import { Stats } from "../stats/stats";
import { ema, hasMinerals } from "../utilities/utils";
import { Visualizer } from "../visuals/Visualizer";
import { Zerg } from "../zerg/Zerg";
import { HiveCluster } from "./_HiveCluster";
import { OverlordPriority } from "priorities/priorities_overlords";

export interface SpawnRequest {
	/** creep body generator to use */
	setup: CreepSetup | CombatCreepSetup;
	/** overlord requesting the creep */
	overlord: Overlord;
	/** priority of the request */
	priority: number;
	/** partners to spawn along with the creep */
	partners?: (CreepSetup | CombatCreepSetup)[];
	/** options */
	options?: SpawnRequestOptions;
}

export interface SpawnRequestOptions {
	/** Use a specific spawn to fulfill the request; only use for high priority */
	spawn?: StructureSpawn;
	/**
	 * The direction in which the creep should move after spawning
	 * See {@link StructureSpawn.spawning.directions}
	 */
	directions?: DirectionConstant[];
}

// interface SpawnOrder {
// 	// protoCreep: ProtoCreep;
// 	options: SpawnOptions | undefined;
// }

export interface HatcheryMemory {
	stats: {
		overload: number;
		uptime: number;
		longUptime: number;
	};
}

const getDefaultHatcheryMemory: () => HatcheryMemory = () => ({
	stats: {
		overload: 0,
		uptime: 0,
		longUptime: 0,
	},
});

/**
 * The hatchery encompasses all spawning-related structures, like spawns, extensions, and some energy buffer containers,
 * and contains logic for spawning the creeps requested by overlords
 */
@profile
export class Hatchery extends HiveCluster {
	memory: HatcheryMemory;
	/** List of spawns in the hatchery */
	spawns: StructureSpawn[];
	/** Spawns that are available to make stuff right now */
	availableSpawns: StructureSpawn[];
	/** List of extensions in the hatchery */
	extensions: StructureExtension[];
	/** All spawns and extensions */
	energyStructures: (StructureSpawn | StructureExtension)[];
	/** The input link */
	link: StructureLink | undefined;
	/** All towers that aren't in the command center */
	towers: StructureTower[];
	/** The container to provide an energy buffer */
	batteries: StructureContainer[];
	/** Box for energy requests */
	transportRequests: TransportRequestGroup;
	/** Hatchery overlord if past larva stage */
	overlord: QueenOverlord | BunkerQueenOverlord;
	/** Settings for hatchery operation */
	settings: {
		/** What value to refill towers at? */
		refillTowersBelow: number;
		/** What value will links store more energy at? */
		linksRequestEnergyBelow: number;
		/** Prevents the hatchery from spawning this tick */
		suppressSpawning: boolean;
	};

	private productionPriorities: number[];
	/** Prioritized spawning queue */
	private productionQueue: {
		[priority: number]: SpawnRequest[];
	};

	/** Flattened list of spawn requests */
	private _spawnRequests: SpawnRequest[] | undefined;
	private isOverloaded: boolean;
	private _waitTimes: { [priority: number]: number } | undefined;

	static restrictedRange = 6; // Don't stand idly within this range of hatchery

	constructor(colony: Colony, headSpawn: StructureSpawn) {
		super(colony, headSpawn, "hatchery");
		// Register structure components
		this.memory = Mem.wrap(
			this.colony.memory,
			"hatchery",
			getDefaultHatcheryMemory
		);
		if (this.colony.layout == "twoPart") {
			this.colony.destinations.push({ pos: this.pos, order: -1 });
		}
		this.spawns = colony.spawns;
		this.availableSpawns = _.filter(
			this.spawns,
			(spawn) => !spawn.spawning
		);
		this.extensions = colony.extensions;
		this.towers =
			colony.commandCenter ?
				_.difference(colony.towers, colony.commandCenter.towers)
			:	colony.towers;
		if (this.colony.layout == "bunker") {
			this.batteries = _.filter(this.room.containers, (cont) =>
				insideBunkerBounds(cont.pos, this.colony)
			);
			$.set(this, "energyStructures", () =>
				this.computeEnergyStructures()
			);
		} else {
			this.link = this.pos.findClosestByLimitedRange(
				colony.availableLinks,
				2
			);
			this.colony.linkNetwork.claimLink(this.link);
			this.batteries = [];
			const battery = this.pos.findClosestByLimitedRange(
				this.room.containers,
				2
			);
			if (battery) {
				this.batteries.push(battery);
			}
			this.energyStructures = (<
				(StructureSpawn | StructureExtension)[]
			>[]).concat(this.spawns, this.extensions);
		}
		this.productionPriorities = [];
		this.productionQueue = {};
		this.isOverloaded = false;
		this._waitTimes = undefined;
		this.settings = {
			refillTowersBelow: 750,
			linksRequestEnergyBelow: 0,
			suppressSpawning: false,
		};
		this.transportRequests = colony.transportRequests; // hatchery always uses colony transport group
	}

	refresh() {
		this.memory = Mem.wrap(
			this.colony.memory,
			"hatchery",
			getDefaultHatcheryMemory
		);
		$.refreshRoom(this);
		$.refresh(
			this,
			"spawns",
			"extensions",
			"energyStructures",
			"link",
			"towers",
			"batteries"
		);
		this.availableSpawns = _.filter(
			this.spawns,
			(spawn) => !spawn.spawning
		);
		this.productionPriorities = [];
		this.productionQueue = {};
		this._spawnRequests = undefined;
		this.isOverloaded = false;
		this._waitTimes = undefined;
	}

	spawnMoarOverlords() {
		const queens = this.colony.getZergByRole("queen");
		if (BunkerQueenOverlord.canFunction(this.colony)) {
			this.overlord = new BunkerQueenOverlord(this); // use bunker queen if has storage and enough energy
		} else {
			this.overlord = new QueenOverlord(this);
		}
		// Reassign queens to the correct overlord
		queens
			.filter((queen) => queen.overlord?.name !== this.overlord.name)
			.forEach((queen) => queen.reassign(this.overlord));
	}

	/**
	 * Returns the approximate aggregated time at which the hatchery will next be available to spawn a creep request
	 * with a given priority.
	 */
	getWaitTimeForPriority(priority: number): number {
		if (!this._waitTimes) {
			const waitTimes: { [priority: number]: number } = {};

			// Initialize wait time to what is currently spawning
			let waitTime =
				_.sum(this.spawns, (spawn) =>
					spawn.spawning ? spawn.spawning.remainingTime : 0
				) / this.spawns.length;

			// Add in expected time for whatever else needs to be spawned, cumulative up to each priority
			for (const priority of _.sortBy(this.productionPriorities)) {
				for (const request of this.productionQueue[priority]) {
					// use cached setup as estimate
					const { body, boosts: _boosts } = request.setup.create(
						this.colony,
						true
					);
					waitTime +=
						(CREEP_SPAWN_TIME * body.length) / this.spawns.length;
				}
				waitTimes[priority] = waitTime;
			}
			this._waitTimes = waitTimes;
		}
		if (this._waitTimes[priority] != undefined) {
			return this._waitTimes[priority];
		}
		const priorities = _.sortBy(this.productionPriorities);
		if (priorities.length == 0) {
			return 0;
		}
		if (priority < _.first(priorities)) {
			return 0;
		}
		// each slot represents time to spawn all of priority, so slot-1 puts you at the beginning of this new priority
		const priorityIndex = _.sortedIndex(priorities, priority) - 1;
		const waitTime = this._waitTimes[priorities[priorityIndex]];
		if (waitTime == undefined) {
			log.error(
				`${this.print}: Undefined wait time in wait times: ${this._waitTimes}!`
			);
			return 0;
		}
		return waitTime;
	}

	// Idle position for queen
	get idlePos(): RoomPosition {
		if (this.batteries?.length) {
			return _.first(this.batteries).pos;
		} else {
			return this.spawns[0].pos.availableNeighbors(true)[0];
		}
	}

	private computeEnergyStructures(): (StructureSpawn | StructureExtension)[] {
		if (this.colony.layout == "bunker") {
			const positions = _.map(energyStructureOrder, (coord) =>
				getPosFromBunkerCoord(coord, this.colony)
			);
			let spawnsAndExtensions: (StructureSpawn | StructureExtension)[] =
				[];
			spawnsAndExtensions = spawnsAndExtensions.concat(
				this.spawns,
				this.extensions
			);
			const energyStructures: (StructureSpawn | StructureExtension)[] =
				[];
			for (const pos of positions) {
				const structure = _.find(
					pos.lookFor(LOOK_STRUCTURES),
					(s) =>
						s.structureType == STRUCTURE_SPAWN ||
						s.structureType == STRUCTURE_EXTENSION
				) as StructureSpawn | StructureExtension;
				if (structure) {
					energyStructures.push(
						_.remove(
							spawnsAndExtensions,
							(s) => s.id == structure.id
						)[0]
					);
				}
			}
			return _.compact(energyStructures.concat(spawnsAndExtensions));
		} else {
			// Ugly workaround to [].concat() throwing a temper tantrum
			let spawnsAndExtensions: (StructureSpawn | StructureExtension)[] =
				[];
			spawnsAndExtensions = spawnsAndExtensions.concat(
				this.spawns,
				this.extensions
			);
			return _.sortBy(spawnsAndExtensions, (structure) =>
				structure.pos.getRangeTo(this.idlePos)
			);
		}
	}

	/* Request more energy when appropriate either via link or hauler */
	private registerEnergyRequests(): void {
		// Register requests for input into the hatchery (goes on colony store group)
		if (this.link && this.link.isEmpty) {
			this.colony.linkNetwork.requestReceive(this.link);
		}
		if (this.batteries) {
			const threshold = this.colony.storage ? 0.5 : 0.75;
			for (const battery of this.batteries) {
				if (
					battery.store.getUsedCapacity() <
					threshold * battery.store.getCapacity()
				) {
					this.colony.logisticsNetwork.requestInput(battery, {
						multiplier: 1.5,
					});
				}
				// get rid of any minerals in the container if present
				if (hasMinerals(battery.store)) {
					this.colony.logisticsNetwork.requestOutputMinerals(battery);
				}
			}
		} else {
			// We don't have the battery up yet, so we need to also ask for input from the logistic network
			// so that transporters participate as well
			_.forEach(this.energyStructures, (struct) =>
				this.colony.logisticsNetwork.requestInput(struct, {
					multiplier: 1.5,
				})
			);
		}
		// Register energy transport requests (goes on hatchery store group, which can be colony store group)
		// let refillStructures = this.energyStructures;
		// if (this.colony.defcon > DEFCON.safe) {
		// 	for (let hostile of this.room.dangerousHostiles) {
		// 		// TODO: remove tranport requests if blocked by enemies
		// 	}
		// }
		// if (this.room.defcon > 0) {refillStructures = _.filter()}
		_.forEach(this.energyStructures, (struct) =>
			this.transportRequests.requestInput(struct, Priority.Normal)
		);

		// let refillSpawns = _.filter(this.spawns, spawn => spawn.energy < spawn.energyCapacity);
		// let refillExtensions = _.filter(this.extensions, extension => extension.energy < extension.energyCapacity);
		const refillTowers = _.filter(
			this.towers,
			(tower) => tower.energy < this.settings.refillTowersBelow
		);
		// _.forEach(refillSpawns, spawn => this.transportRequests.requestInput(spawn, Priority.NormalLow));
		// _.forEach(refillExtensions, extension => this.transportRequests.requestInput(extension, Priority.NormalLow));
		_.forEach(refillTowers, (tower) =>
			this.transportRequests.requestInput(tower, Priority.NormalLow)
		);
	}

	// Creep queueing and spawning =====================================================================================

	private generateCreepName(roleName: string): string {
		// Generate a creep name based on the role and add a suffix to make it unique
		let i = 0;
		while (Game.creeps[roleName + "_" + i]) {
			i++;
		}
		return roleName + "_" + i;
	}

	private spawnCreep(
		protoCreep: ProtoCreep,
		options: SpawnRequestOptions = {}
	) {
		// If you can't build it, return this error
		if (protoCreep.body.length === 0) {
			return ERR_INVALID_ARGS;
		}
		const availableEnergy =
			this.colony.state.bootstrapping ?
				_.sum(this.energyStructures, (s) =>
					s.store.getUsedCapacity(RESOURCE_ENERGY)
				)
			:	this.room.energyCapacityAvailable;
		if (bodyCost(protoCreep.body) > availableEnergy) {
			return ERR_ROOM_ENERGY_CAPACITY_NOT_ENOUGH;
		}
		// Get a spawn to use
		let spawnToUse: StructureSpawn | undefined;
		if (options.spawn) {
			spawnToUse = options.spawn;
			if (spawnToUse.spawning) {
				return ERR_SPECIFIED_SPAWN_BUSY;
			} else {
				_.remove(
					this.availableSpawns,
					(spawn) => spawn.id == spawnToUse!.id
				); // mark as used
			}
		} else {
			spawnToUse = this.availableSpawns.shift();
		}
		// If you have a spawn available then spawn the creep
		if (spawnToUse) {
			if (
				this.colony.bunker &&
				this.colony.bunker.coreSpawn &&
				spawnToUse.id == this.colony.bunker.coreSpawn.id &&
				!options.directions
			) {
				options.directions = [TOP, RIGHT]; // don't spawn into the manager spot
			}
			protoCreep.name = this.generateCreepName(protoCreep.name); // modify the creep name to make it unique
			protoCreep.memory.data.origin = spawnToUse.pos.roomName;

			// Spawn the creep
			const result = spawnToUse.spawnCreep(
				protoCreep.body,
				protoCreep.name,
				{
					memory: protoCreep.memory,
					energyStructures: this.energyStructures,
					directions: options.directions,
				}
			);

			if (result == OK) {
				// Creep has been successfully spawned; add cost into profiling
				const overlordRef = protoCreep.memory[MEM.OVERLORD];
				const overlord =
					overlordRef ? Overmind.overlords[overlordRef] : null;
				if (overlord) {
					overlord.debug(
						`${this.print} successfully spawned creep ${protoCreep.name} for ${overlord?.print}`
					);
					if (overlord.memory[MEM.STATS]) {
						overlord.memory[MEM.STATS]!.spawnCost += bodyCost(
							protoCreep.body
						);
					}
				} else {
					// This shouldn't ever happen
					log.error(
						`No overlord for protocreep ${protoCreep.name} at hatchery ${this.print}!`
					);
				}
				return result;
			} else {
				this.availableSpawns.unshift(spawnToUse); // return the spawn to the available spawns list
				return result;
			}
		} else {
			// otherwise, if there's no spawn to use, return busy
			return ERR_BUSY;
		}
	}

	canSpawn(body: BodyPartConstant[]): boolean {
		return bodyCost(body) <= this.room.energyCapacityAvailable;
	}

	canSpawnZerg(zerg: Zerg): boolean {
		return this.canSpawn(_.map(zerg.body, (part) => part.type));
	}

	/* Generate (but not spawn) the largest creep possible, returns the protoCreep as an object */
	private generateProtoCreep(
		setup: CreepSetup | CombatCreepSetup,
		overlord: Overlord
	): ProtoCreep {
		// Generate the creep memory
		const creepMemory: CreepMemory = {
			[MEM.COLONY]: overlord.colony.name, // name of the colony the creep is assigned to
			[MEM.OVERLORD]: overlord.ref, // name of the Overlord running this creep
			role: setup.role, // role of the creep
			task: null, // task the creep is performing
			data: {
				// rarely-changed data about the creep
				origin: "", // where it was spawned, filled in at spawn time
			},
		};

		// Generate the creep body
		const { body, boosts } = setup.create(this.colony);

		if (boosts.length > 0) {
			creepMemory.needBoosts = boosts; // tell the creep what boosts it will need to get
		}

		// Create the protocreep and return it
		const protoCreep: ProtoCreep = {
			// object to add to spawner queue
			body: body, // body array
			name: setup.role, // name of the creep; gets modified by hatchery
			memory: creepMemory, // memory to initialize with
		};
		return protoCreep;
	}

	private logRequest(request: SpawnRequest) {
		return `${request.setup.role}@${request.priority}`;
	}

	/**
	 * Enqueues a spawn request to the hatchery production queue
	 */
	enqueue(request: SpawnRequest): void {
		const priority = request.priority;

		// Spawn the creep yourself if you can
		this._waitTimes = undefined; // invalidate cache
		if (!this.productionQueue[priority]) {
			this.productionQueue[priority] = [];
			this.productionPriorities.push(priority); // this is necessary because keys interpret number as string
		}
		this.productionQueue[priority].push(request);
	}

	private spawnHighestPriorityCreep() {
		while (
			this.availableSpawns.length > 0 &&
			this.spawnRequests.length > 0
		) {
			const request = this.spawnRequests.shift()!;

			// don't spawn non-critical creeps during wartime
			if (
				this.colony.defcon >= DEFCON.playerInvasion &&
				request.priority > OverlordPriority.warSpawnCutoff
			) {
				this.debug(
					`request ${this.logRequest(
						request
					)} is over war-time cut-off, ignoring`
				);
				continue;
			}

			// Generate a protocreep from the request
			const protoCreep = this.generateProtoCreep(
				request.setup,
				request.overlord
			);
			const preLog =
				`request ${this.logRequest(request)}, needed ${bodyCost(
					protoCreep.body
				)}, ` +
				`stored: ${this.room.energyAvailable}, total: ${this.room.energyCapacityAvailable}`;
			// Try to spawn the creep
			const result = this.spawnCreep(protoCreep, request.options);
			if (result == OK) {
				this.debug(`${preLog}: spawn successful`);
				return result;
			} else if (result == ERR_SPECIFIED_SPAWN_BUSY) {
				this.debug(`${preLog}: requested spawn is busy`);
				// continue to spawn other things while waiting on specified spawn
				return result;
			} else if (result === ERR_INVALID_ARGS) {
				this.debug(
					`${preLog}: asked to spawn an invalid creep, ignoring`
				);
			} else if (
				result === ERR_NOT_ENOUGH_ENERGY ||
				result === ERR_ROOM_ENERGY_CAPACITY_NOT_ENOUGH
			) {
				// If there's not enough energyCapacity to spawn, ignore and move on, otherwise block and wait
				this.debug(`${preLog}: not enough energy, ignoring`);
				return result;
			} else {
				this.debug(`${preLog}: failed to spawn, requeuing: ${result}`);
				this.spawnRequests.unshift(request);
				return result;
			}
		}
	}

	// Runtime operation ===============================================================================================
	init(): void {
		this.registerEnergyRequests();
	}

	run(): void {
		// Handle spawning
		if (!this.settings.suppressSpawning) {
			const spawningSpawns = this.spawns.filter((s) => s.spawning);
			let requests = this.spawnRequests;
			if (
				(spawningSpawns.length || requests.length) &&
				Game.time % 5 === 0
			) {
				this.debug(() => {
					let msg = "";
					// Slice out the in-progress requests so they don't show up twice
					requests = requests.slice(spawningSpawns.length);
					if (spawningSpawns.length) {
						msg += `spawning: ${spawningSpawns
							.map(
								(s) =>
									`${
										Memory.creeps[s.spawning!.name].role
									} in ${s.spawning!.remainingTime} ticks`
							)
							.join(", ")}`;
					}
					if (spawningSpawns.length && requests.length) {
						msg += ", ";
					}
					if (requests.length) {
						msg += `queued: ${requests
							.map((request) => this.logRequest(request))
							.join(", ")}`;
					}
					return msg;
				});
			}

			// We're under attack, go through the list of in-progress spawns and
			// yank anything that's not war-time related and not close to spawning.
			if (this.colony.defcon >= DEFCON.playerInvasion) {
				for (const spawn of this.spawns.filter((s) => s.spawning)) {
					const spawningCreep = Memory.creeps[spawn.spawning!.name];
					const overlord =
						spawningCreep[MEM.OVERLORD] ?
							Overmind.overlords[spawningCreep[MEM.OVERLORD]!]
						:	undefined;
					if (
						overlord &&
						overlord.priority >= OverlordPriority.warSpawnCutoff &&
						spawn.spawning!.remainingTime > 5
					) {
						log.warning(
							`${this.print}: cancelling spawn of ${spawningCreep.role} because of war-time`
						);
						spawn.spawning!.cancel();
					}
				}
			}

			// Spawn all queued creeps that you can
			while (this.availableSpawns.length > 0) {
				const result = this.spawnHighestPriorityCreep();
				if (result == ERR_NOT_ENOUGH_ENERGY) {
					// if you can't spawn something you want to
					this.isOverloaded = true;
				}
				if (result != OK && result != ERR_SPECIFIED_SPAWN_BUSY) {
					// Can't spawn creep right now
					break;
				}
			}

			// Move creeps off of exit position to let the spawning creep out if necessary
			for (const spawn of this.spawns) {
				if (
					spawn.spawning &&
					spawn.spawning.remainingTime <= 1 &&
					spawn.pos.findInRange(FIND_MY_CREEPS, 1).length > 0
				) {
					let directions: DirectionConstant[];
					if (spawn.spawning.directions) {
						directions = spawn.spawning.directions;
					} else {
						directions = _.map(
							spawn.pos.availableNeighbors(true),
							(pos) => spawn.pos.getDirectionTo(pos)
						);
					}
					const exitPos = Pathing.positionAtDirection(
						spawn.pos,
						_.first(directions)
					) as RoomPosition;
					Movement.vacatePos(exitPos);
				}
			}
		}

		this.recordStats();
	}

	/** The list of ongoing requests, sorted by priority */
	get spawnRequests(): SpawnRequest[] {
		if (!this._spawnRequests) {
			this._spawnRequests = [];
			const sortedKeys = _.sortBy(this.productionPriorities);
			for (const priority of sortedKeys) {
				const requests = this.productionQueue[priority];
				if (requests.length > 0) {
					this._spawnRequests.push(...requests);
				}
			}
		}
		return this._spawnRequests;
	}

	private recordStats() {
		// Compute uptime and overload status
		const spawnUsageThisTick =
			_.filter(this.spawns, (spawn) => spawn.spawning).length /
			this.spawns.length;
		const uptime = ema(
			spawnUsageThisTick,
			this.memory.stats.uptime,
			CREEP_LIFE_TIME
		);
		const longUptime = ema(
			spawnUsageThisTick,
			this.memory.stats.longUptime,
			3 * CREEP_LIFE_TIME
		);
		const overload = ema(
			this.isOverloaded ? 1 : 0,
			this.memory.stats.overload,
			CREEP_LIFE_TIME
		);

		Stats.log(`colonies.${this.colony.name}.hatchery.uptime`, uptime);
		Stats.log(`colonies.${this.colony.name}.hatchery.overload`, overload);

		this.memory.stats = { overload, uptime, longUptime };
	}

	visuals(coord: Coord): Coord {
		let { x, y } = coord;
		const spawnMap = new Map<string, [string, number, number]>();
		for (const spawn of this.spawns) {
			if (spawn.spawning) {
				const timeElapsed =
					spawn.spawning.needTime - spawn.spawning.remainingTime;
				const role =
					Memory.creeps[spawn.spawning.name].role ?? "unknown";
				spawnMap.set(spawn.id, [
					role,
					timeElapsed,
					spawn.spawning.needTime,
				]);
			}
		}
		const boxCoords = Visualizer.section(
			`${this.colony.name} Hatchery`,
			{ x, y, roomName: this.room.name },
			9.5,
			4 + spawnMap.size + 0.1
		);
		const boxX = boxCoords.x;
		y = boxCoords.y + 0.25;

		// Log energy
		Visualizer.text("Energy", { x: boxX, y: y, roomName: this.room.name });
		Visualizer.barGraph(
			[this.room.energyAvailable, this.room.energyCapacityAvailable],
			{ x: boxX + 4, y: y, roomName: this.room.name },
			5
		);
		y += 1;

		// Log uptime
		const uptime = this.memory.stats.uptime;
		Visualizer.text("Uptime", { x: boxX, y: y, roomName: this.room.name });
		Visualizer.barGraph(
			uptime,
			{ x: boxX + 4, y: y, roomName: this.room.name },
			5
		);
		y += 1;

		// Log overload status
		const overload = this.memory.stats.overload;
		Visualizer.text("Overload", {
			x: boxX,
			y: y,
			roomName: this.room.name,
		});
		Visualizer.barGraph(
			overload,
			{ x: boxX + 4, y: y, roomName: this.room.name },
			5
		);
		y += 1;

		const numSpawning = this.spawns.reduce(
			(v, s) => (v += s.spawning ? 1 : 0),
			0
		);
		let queued = this.spawnRequests
			.slice(numSpawning)
			.map((r) => r.setup.role[0])
			.join("");
		if (queued.length > 9) {
			queued = queued.substring(0, 9) + "…";
		}
		if (queued.length > 0) {
			Visualizer.text("Queued", {
				x: boxX,
				y: y,
				roomName: this.room.name,
			});
			Visualizer.text(
				queued,
				{ x: boxX + 4, y: y, roomName: this.room.name },
				undefined,
				{
					font: `0.8 Courier`,
				}
			);
			y += 1;
		}

		for (const [_id, [name, elapsed, total]] of spawnMap) {
			Visualizer.text(name, { x: boxX, y: y, roomName: this.room.name });
			Visualizer.barGraph(
				[elapsed, total],
				{ x: boxX + 4, y: y, roomName: this.room.name },
				5
			);
			y += 1;
		}
		return { x: x, y: y + 0.25 };
	}
}
