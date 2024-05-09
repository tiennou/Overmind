import { NO_ACTION, errorForCode } from "utilities/errors";
import { Colony, getAllColonies } from "../Colony";
import { LogMessage, log } from "../console/log";
import { isAnyZerg, isPowerCreep } from "../declarations/typeGuards";
import { MoveOptions } from "movement/types";
import { Movement } from "movement/Movement";
import { Pathing } from "movement/Pathing";
import { Overlord } from "../overlords/Overlord";
import { profile } from "../profiler/decorator";
import { Cartographer, ROOMTYPE_SOURCEKEEPER } from "../utilities/Cartographer";
import { minBy } from "../utilities/utils";
import { config } from "config";
import { RANGES } from "./ranges";
import type { GenericTask, Task } from "tasks/Task";
import { initializeTask } from "tasks/initializer";
import { Visualizer } from "visuals/Visualizer";

export function normalizeAnyZerg(
	creep: AnyZerg | AnyCreep
): AnyZerg | AnyCreep {
	return Overmind.zerg[creep.name] || Overmind.powerZerg[creep.name] || creep;
}

interface _ParkingOptions {
	range: number;
	exactRange: boolean;
	offroad: boolean;
}

const FLEE_DEFAULT_TIMER = 10;
const FLEE_DEFAULT_FALLBACK_RANGE = 6;

interface FleeOptions {
	timer?: number;
	dropEnergy?: boolean;
	invalidateTask?: boolean;
	/**
	 * How many rooms away should the creep look for a room to fallback to
	 */
	fallbackColonyRange?: number;
}

/**
 * The AnyZerg abstract class contains all of the base methods that are present on both the Zerg and PowerZerg classes.
 * Most of these methods have been moved from the Zerg class.
 */
@profile
export abstract class AnyZerg {
	isAnyZerg: true;
	creep: AnyCreep; // The creep that this wrapper class will control
	// These properties are all wrapped from this.creep.* to this.*
	store: StoreDefinition;
	effects: RoomObjectEffect[];
	hits: number;
	hitsMax: number;
	id: string;
	memory: CreepMemory;
	name: string;
	pos: RoomPosition;
	/** The next position the creep will be in after registering a move intent */
	nextPos: RoomPosition;
	ref: string;
	roleName: string;
	room: Room;
	saying: string;
	ticksToLive: number | undefined;
	lifetime: number;
	/** Tracks the actions that a creep has completed this tick */
	actionLog: { [actionName: string]: boolean };
	/** Whether the zerg is allowed to move or not */
	blockMovement: boolean;

	/** Cached Task object that is instantiated once per tick and on change */
	private _task: Task<AnyZerg, any> | null;

	constructor(creep: AnyCreep, notifyWhenAttacked = true) {
		this.isAnyZerg = true;
		// Copy over creep references
		this.creep = creep;
		this.store = creep.store;
		this.effects = creep.effects;
		this.hits = creep.hits;
		this.hitsMax = creep.hitsMax;
		this.id = creep.id;
		this.memory = creep.memory;
		this.name = creep.name;
		this.pos = creep.pos;
		this.nextPos = creep.pos;
		this.ref = creep.ref;
		this.roleName = creep.memory.role;
		this.room = creep.room!; // only wrap actively spawned PowerCreeps
		this.saying = creep.saying;
		this.ticksToLive = creep.ticksToLive;
		// Extra properties
		if (isPowerCreep(creep)) {
			this.lifetime = POWER_CREEP_LIFE_TIME;
		} else {
			this.lifetime =
				_.filter(creep.body, (part) => part.type == CLAIM).length > 0 ?
					CREEP_CLAIM_LIFE_TIME
				:	CREEP_LIFE_TIME;
		}
		this.actionLog = {};
		this.blockMovement = false;
		// Register global references
		// @ts-expect-error Global getter for Zergs
		global[this.name] = this;
		// Handle attack notification when at lifetime - 1
		if (
			!notifyWhenAttacked &&
			(this.ticksToLive || 0) >=
				this.lifetime - (config.NEW_OVERMIND_INTERVAL + 1)
		) {
			// creep.notifyWhenAttacked only uses the 0.2CPU intent cost if it changes the intent value
			this.notifyWhenAttacked(notifyWhenAttacked);
		}
	}

	/**
	 * Refresh all changeable properties of the creep or delete from Overmind and global when dead
	 */
	refresh(): void {
		const creep = Game.creeps[this.name];
		if (creep) {
			this.creep = creep;
			this.pos = creep.pos;
			this.nextPos = creep.pos;
			this.store = creep.store;
			this.hits = creep.hits;
			this.memory = creep.memory;
			this.room = creep.room;
			this.saying = creep.saying;
			this.ticksToLive = creep.ticksToLive;
			this.actionLog = {};
			this.blockMovement = false;
			this._task = null;
		} else {
			log.debug(`Deleting ${this.print} from global`);
			// @ts-expect-error Global getter for Zergs
			delete global[this.name];
		}
	}

	debug(...args: LogMessage[]) {
		if (this.memory.debug) {
			log.alert(this.print, ...args);
		}
	}

	get print(): string {
		return (
			'<a href="#!/room/' +
			Game.shard.name +
			"/" +
			this.pos.roomName +
			'">[' +
			this.name +
			"]</a>"
		);
	}

	// Wrapped creep methods ===========================================================================================

	cancelOrder(
		methodName: string
	): OK | ERR_NOT_OWNER | ERR_BUSY | ERR_NOT_FOUND {
		const result = this.creep.cancelOrder(methodName);
		if (result == OK) {
			this.actionLog[methodName] = false;
		}
		return result;
	}

	drop(resourceType: ResourceConstant, amount?: number) {
		const result = this.creep.drop(resourceType, amount);
		this.actionLog.drop ??= result == OK;
		return result;
	}

	goDrop(pos: RoomPosition, resourceType: ResourceConstant, amount?: number) {
		if (this.pos.inRangeToPos(pos, RANGES.DROP)) {
			return this.drop(resourceType, amount);
		} else {
			return this.goTo(pos);
		}
	}

	move(direction: DirectionConstant, force = false) {
		if (!this.blockMovement || force) {
			const result = this.creep.move(direction);
			this.actionLog.move ??= result == OK;
			if (result == OK) {
				this.nextPos = this.pos.getPositionAtDirection(direction);
			}
			return result;
		} else {
			return ERR_BUSY;
		}
	}

	notifyWhenAttacked(enabled: boolean) {
		return this.creep.notifyWhenAttacked(enabled);
	}

	pickup(resource: Resource) {
		const result = this.creep.pickup(resource);
		if (!this.actionLog.pickup) {
			this.actionLog.pickup = result == OK;
		}
		return result;
	}

	goPickup(resource: Resource) {
		if (this.pos.inRangeToPos(resource.pos, RANGES.DROP)) {
			return this.pickup(resource);
		} else {
			return this.goTo(resource.pos);
		}
	}

	/* Say a message; maximum message length is 10 characters */
	say(message: string, pub?: boolean) {
		return this.creep.say(message, pub);
	}

	suicide() {
		this.say("💀 RIP 💀", true);
		return this.creep.suicide();
	}

	transfer(
		target: AnyCreep | AnyZerg | Structure,
		resourceType: ResourceConstant = RESOURCE_ENERGY,
		amount?: number
	) {
		let result: ScreepsReturnCode;
		if (isAnyZerg(target)) {
			result = this.creep.transfer(target.creep, resourceType, amount);
		} else {
			result = this.creep.transfer(target, resourceType, amount);
		}
		this.actionLog.transfer ??= result == OK;
		return result;
	}

	transferAll(target: AnyCreep | AnyZerg | Structure) {
		for (const [resourceType, amount] of this.creep.store.contents) {
			if (amount > 0) {
				return this.transfer(target, resourceType);
			}
		}
	}

	goTransfer(
		target: Creep | AnyZerg | Structure,
		resourceType: ResourceConstant = RESOURCE_ENERGY,
		amount?: number
	): void {
		if (this.transfer(target, resourceType, amount) == ERR_NOT_IN_RANGE) {
			this.goTo(target);
		}
	}

	withdraw(
		target: Structure | Tombstone | Ruin,
		resourceType: ResourceConstant = RESOURCE_ENERGY,
		amount?: number
	) {
		const result = this.creep.withdraw(target, resourceType, amount);
		this.actionLog.withdraw ??= result == OK;
		return result;
	}

	goWithdraw(
		target: Structure | Tombstone,
		resourceType: ResourceConstant = RESOURCE_ENERGY,
		amount?: number
	): void {
		if (this.withdraw(target, resourceType, amount) == ERR_NOT_IN_RANGE) {
			this.goTo(target);
		}
	}

	sleep(until: number) {
		this.memory.sleepUntil = until;
	}

	isSleeping(): boolean {
		if (this.memory.sleepUntil) {
			this.debug(`sleeping for ${this.memory.sleepUntil - Game.time}`);
			if (Game.time >= this.memory.sleepUntil) {
				delete this.memory.sleepUntil;
				return false;
			}
			return true;
		}
		return false;
	}

	goHome() {
		return this.goToRoom(this.memory.data.origin);
	}

	// Custom creep methods ============================================================================================

	get isDamaged() {
		return this.hits < this.hitsMax;
	}

	// Carry methods

	get hasMineralsInCarry(): boolean {
		for (const [resourceType, amount] of this.store.contents) {
			if (resourceType != RESOURCE_ENERGY && amount > 0) {
				return true;
			}
		}
		return false;
	}

	// Task logic ------------------------------------------------------------------------------------------------------

	/**
	 * Wrapper for _task
	 */
	get task(): GenericTask | null {
		if (!this._task) {
			this._task =
				this.memory.task ? initializeTask(this.memory.task) : null;
		}
		return this._task;
	}

	/**
	 * Assign the creep a task with the setter, replacing creep.assign(Task)
	 */
	set task(task: GenericTask | null) {
		// Unregister target from old task if applicable
		const oldProtoTask = this.memory.task;
		if (oldProtoTask) {
			const oldRef = oldProtoTask._target.ref;
			if (Overmind.cache.targets[oldRef]) {
				_.remove(
					Overmind.cache.targets[oldRef],
					(name) => name == this.name
				);
			}
		}
		// Set the new task
		this.memory.task = task ? task.proto : null;
		if (task) {
			if (task.target) {
				// Register task target in cache if it is actively targeting something (excludes goTo and similar)
				if (!Overmind.cache.targets[task.target.ref]) {
					Overmind.cache.targets[task.target.ref] = [];
				}
				Overmind.cache.targets[task.target.ref].push(this.name);
			}
			// Register references to creep
			task.creep = this;
		}
		// Clear cache
		this._task = null;
	}

	/**
	 * Does the creep have a valid task at the moment?
	 */
	get hasValidTask(): boolean {
		return !!this.task && this.task.isValid();
	}

	/**
	 * Creeps are idle if they don't have a task.
	 */
	get isIdle(): boolean {
		return !this.task || !this.task.isValid();
	}

	// Overlord logic --------------------------------------------------------------------------------------------------

	get overlord(): Overlord | null {
		if (this.memory[MEM.OVERLORD]) {
			return Overmind.overlords[this.memory[MEM.OVERLORD]] || null;
		} else {
			return null;
		}
	}

	set overlord(newOverlord: Overlord | null) {
		// Remove cache references to old assignments
		const roleName = this.memory.role;
		const ref = this.memory[MEM.OVERLORD];
		const oldOverlord: Overlord | null =
			ref ? Overmind.overlords[ref] : null;
		if (
			ref &&
			Overmind.cache.overlords[ref] &&
			Overmind.cache.overlords[ref][roleName]
		) {
			_.remove(
				Overmind.cache.overlords[ref][roleName],
				(name) => name == this.name
			);
		}
		if (newOverlord) {
			// Change to the new overlord's colony
			this.memory[MEM.COLONY] = newOverlord.colony.name;
			// Change assignments in memory
			this.memory[MEM.OVERLORD] = newOverlord.ref;
			// Update the cache references
			if (!Overmind.cache.overlords[newOverlord.ref]) {
				Overmind.cache.overlords[newOverlord.ref] = {};
			}
			if (!Overmind.cache.overlords[newOverlord.ref][roleName]) {
				Overmind.cache.overlords[newOverlord.ref][roleName] = [];
			}
			Overmind.cache.overlords[newOverlord.ref][roleName].push(this.name);
		} else {
			this.memory[MEM.OVERLORD] = null;
		}
		if (oldOverlord) {
			oldOverlord.recalculateCreeps();
		}
		if (newOverlord) {
			newOverlord.recalculateCreeps();
		}
	}

	/**
	 * When a zerg has no more use for its current overlord, it will be retired.
	 */
	retire() {
		if (this.colony && !isPowerCreep(this.creep)) {
			const colonySpawns = this.colony?.hatchery?.spawns ?? [];
			const nearbySpawn =
				this.pos.findClosestByMultiRoomRange(colonySpawns);

			if (nearbySpawn) {
				log.info(
					`${this.print} is retiring from duty to ${nearbySpawn.print}`
				);
				this.overlord = this.colony.overlords.default;
				this.task = Tasks.retire(nearbySpawn);
			}
			return;
		}

		log.warning(`${this.print} is committing suicide!`);
		return this.suicide();
	}

	/**
	 * Reassigns the creep to work under a new overlord and as a new role.
	 */
	reassign(
		newOverlord: Overlord | null,
		newRole?: string,
		invalidateTask = true
	) {
		this.overlord = newOverlord;
		if (
			newOverlord &&
			newOverlord.colony &&
			this.colony != newOverlord.colony
		) {
			this.colony = newOverlord.colony;
		}
		if (newRole) {
			this.roleName = newRole;
			this.memory.role = newRole;
		}
		if (invalidateTask) {
			this.task = null;
		}
	}

	/**
	 * Execute the task you currently have.
	 */
	run(): number | undefined {
		let res;
		if (this.task) {
			res = this.task.run();
		}

		if (this.memory.debug) {
			const data = [this.name];

			if (this.task) {
				data.push(`task: ${this.task.name}`);
				data.push(`status: ${errorForCode(res ?? OK)}`);
				data.push(`pos: ${this.task.targetPos.printPlain}`);
			} else {
				data.push(`idle`);
			}

			new RoomVisual(this.room.name).infoBox(
				data,
				this.pos.x,
				this.pos.y,
				{
					opacity: 0.9,
				}
			);

			// Current path
			if (this.memory._go && this.memory._go?.path) {
				// log.debug(`${this.creep}: ${this.nextPos.print} ${this.pos.print}`);
				const serialPath = this.memory._go?.path.substring(1);
				const path = Pathing.deserializePath(this.nextPos, serialPath);
				// log.debug(`${this.print} has path: ${path.length}, ${path.map(p => p.print).join(" > ")}`);
				Visualizer.drawPath(path, { fill: "red", lineStyle: "dashed" });

				const lastStep = _.last(path);
				if (lastStep) {
					if (lastStep.roomName !== this.pos.roomName || true) {
						const lastData = [
							this.name,
							`eta: ${
								this.task?.eta ??
								this.memory._go.path.length ??
								NaN
							}`,
						];
						new RoomVisual(lastStep.roomName).infoBox(
							lastData,
							lastStep.x,
							lastStep.y,
							{
								color: "red",
								opacity: 0.6,
							}
						);
					}
				}
			}
		}
		return res;
	}

	// Colony association ----------------------------------------------------------------------------------------------

	/**
	 * Colony that the creep belongs to.
	 */
	get colony(): Colony | null {
		if (this.memory[MEM.COLONY] != null) {
			return Overmind.colonies[this.memory[MEM.COLONY]];
		} else {
			return null;
		}
	}

	set colony(newColony: Colony | null) {
		if (newColony != null) {
			this.memory[MEM.COLONY] = newColony.name;
		} else {
			this.memory[MEM.COLONY] = null;
		}
	}

	/**
	 * If the creep is in a colony room or outpost
	 */
	get inColonyRoom(): boolean {
		return Overmind.colonyMap[this.room.name] == this.memory[MEM.COLONY];
	}

	// Movement and location -------------------------------------------------------------------------------------------

	goTo(
		destination: RoomPosition | _HasRoomPosition,
		options: MoveOptions = {}
	) {
		return Movement.goTo(this, destination, options);
	}

	goToRoom(roomName: string, options: MoveOptions = {}) {
		return Movement.goToRoom(this, roomName, options);
	}

	inSameRoomAs(target: _HasRoomPosition): boolean {
		return this.pos.roomName == target.pos.roomName;
	}

	safelyInRoom(roomName: string): boolean {
		return this.room.name == roomName && !this.pos.isEdge;
	}

	get inRampart(): boolean {
		return this.creep.inRampart;
	}

	get isMoving(): boolean {
		const moveData = this.memory._go;
		return (
			(!!moveData && !!moveData.path && moveData.path.length > 1) ||
			this.actionLog[MOVE]
		);
	}

	/**
	 * Kite around hostiles in the room
	 */
	kite(
		avoidGoals: (RoomPosition | _HasRoomPosition)[] = this.room.hostiles,
		options: MoveOptions = {}
	) {
		return Movement.kite(this, avoidGoals, options);
	}

	private defaultFleeGoals() {
		let fleeGoals: (RoomPosition | _HasRoomPosition)[] = [];
		fleeGoals = fleeGoals
			.concat(this.room.hostiles)
			.concat(
				_.filter(
					this.room.keeperLairs,
					(lair) => (lair.ticksToSpawn || Infinity) < 10
				)
			);
		return fleeGoals;
	}

	/**
	 * Flee from hostiles in the room, while not repathing every tick // TODO: take a look at this
	 */
	flee(
		avoidGoals: (RoomPosition | _HasRoomPosition)[] = this.room
			.fleeDefaults,
		fleeOptions: FleeOptions = {},
		moveOptions: MoveOptions = {}
	): boolean {
		if (
			avoidGoals.length == 0 ||
			this.room.dangerousHostiles.find(
				(creep) => creep.pos.getRangeToXY(this.pos.x, this.pos.y) < 6
			) == undefined
		) {
			return false;
		} else if (
			this.room.controller &&
			this.room.controller.my &&
			this.room.controller.safeMode
		) {
			return false;
		} else {
			return (
				Movement.flee(
					this,
					avoidGoals,
					fleeOptions.dropEnergy,
					moveOptions
				) !== NO_ACTION
			);
		}
	}

	/**
	 * Callback that is checked for many civilian roles. Returns true if the civilian zerg is in a dangerous situation
	 * and handles the zerg retreating to a fallback room. Acts as a replacement to the current default Zerg.flee()
	 * danger avoidance logic
	 */
	avoidDanger(opts: FleeOptions = {}): boolean {
		// If you're almost expired or you're spawning do nothing - if you get killed you're cheap and faster to replace
		if ((this.ticksToLive ?? 0) < 50) {
			return false; // I just wanna die!!
		}

		_.defaults(opts, <FleeOptions>{
			timer: FLEE_DEFAULT_TIMER,
			dropEnergy: true,
			fallbackColonyRange: FLEE_DEFAULT_FALLBACK_RANGE,
		});

		const closestHostile = this.pos.findClosestByLimitedRange(
			this.room.dangerousHostiles,
			RANGES.RANGED_ATTACK + 2
		);
		const roomIsSafe = this.room.isSafe || !!closestHostile;

		// If you previously determined you are in danger, wait for timer to expire
		if (this.memory.avoidDanger) {
			if (this.memory.avoidDanger.timer > 0 && !roomIsSafe) {
				if (this.memory.avoidDanger.flee === true) {
					this.debug(
						() =>
							`in danger, random flee from ${this.room.dangerousHostiles.map(
								(c) => c.print
							)}!`
					);
					this.flee(this.room.dangerousHostiles, opts);
					return true;
				}

				this.debug(
					() =>
						`in danger, fleeing from ${this.room.dangerousHostiles.map(
							(c) => c.print
						)} toward ${this.memory.avoidDanger!.flee}!`
				);
				this.goToRoom(this.memory.avoidDanger.flee);
				if (opts.dropEnergy && this.store.energy > 0) {
					this.drop(RESOURCE_ENERGY); // transfer energy to container check is only run on first danger tick
				}
				this.memory.avoidDanger.timer--;
				return true;
			} else {
				delete this.memory.avoidDanger;
			}
		}

		if (!roomIsSafe || this.hits < this.hitsMax) {
			this.debug(
				() =>
					`roomIsSafe: ${roomIsSafe}, damage: ${this.hits}/${this.hitsMax}`
			);

			if (
				Cartographer.roomType(this.room.name) == ROOMTYPE_SOURCEKEEPER
			) {
				// If you're in an SK room, you can skip the danger avoidance as long as you have max hp, there are no
				// player hostiles, no invaders, and you're not in range to any of the sourceKeepers or spawning lairs
				if (
					this.hits == this.hitsMax &&
					this.room.dangerousPlayerHostiles.length == 0 &&
					this.room.invaders.length == 0 &&
					!_.any(this.room.fleeDefaults, (fleeThing) =>
						this.pos.inRangeTo(fleeThing, 5)
					)
				) {
					this.debug(
						() =>
							`${
								!roomIsSafe ? "room is unsafe" : `damaged`
							}, but in SK room, and no hostiles around, ignoring`
					);
					// Not actually in danger
					return false;
				}
			}

			let flee: string | true;
			const maxLinearRange = opts.fallbackColonyRange!;
			const isInColonyRoom =
				this.colony ? this.colony.name === this.room.name : false;
			// Like 99.999% of the time this will be the case
			// FIXME: this doesn't handle portals
			if (
				this.colony &&
				Game.map.getRoomLinearDistance(
					this.room.name,
					this.colony.name
				) <= maxLinearRange &&
				!isInColonyRoom
			) {
				flee = this.colony.name;
			} else {
				// Pick the closest colony we can find, ignoring our own if it's under attack
				const nearbyColonies = _.filter(getAllColonies(), (colony) => {
					if (isInColonyRoom && colony.name === this.colony!.name) {
						return false;
					}
					return (
						Game.map.getRoomLinearDistance(
							this.room.name,
							colony.name
						) <= maxLinearRange
					);
				});
				const closestColony = minBy(nearbyColonies, (colony) => {
					const route = Pathing.findRoute(
						this.room.name,
						colony.room.name
					);
					if (route == ERR_NO_PATH) {
						return false;
					} else {
						return route.length;
					}
				});
				if (closestColony) {
					flee = closestColony.name;
				} else {
					log.error(
						`${this.print} is all alone in a dangerous place and can't find their way home!`
					);
					flee = true;
				}
			}

			this.memory.avoidDanger = {
				start: Game.time,
				timer: opts.timer!,
				flee: flee,
			};

			if (flee === true) {
				this.flee(this.room.dangerousHostiles, opts);
				this.debug(
					() =>
						`random flee from ${this.room.dangerousHostiles.map(
							(c) => c.print
						)}`
				);
				return true;
			}

			if (opts.dropEnergy && this.store.energy > 0) {
				const containersInRange = this.pos.findInRange(
					this.room.containers,
					1
				);
				const adjacentContainer = _.first(containersInRange);
				if (adjacentContainer) {
					this.transfer(adjacentContainer, RESOURCE_ENERGY);
				}
			}

			this.debug(() => `fleeing toward room ${flee}`);
			this.goToRoom(flee);
			return true;
		}

		return false;
	}

	/**
	 * Park the creep off-roads
	 */
	park(pos: RoomPosition = this.pos, maintainDistance = false): number {
		return Movement.park(this, pos, maintainDistance);
	}

	/**
	 * Moves a creep off of the current tile to the first available neighbor
	 */
	moveOffCurrentPos() {
		return Movement.moveOffCurrentPos(this);
	}

	/**
	 * Moves onto an exit tile
	 */
	moveOnExit() {
		return Movement.moveOnExit(this);
	}

	/**
	 * Moves off of an exit tile
	 */
	moveOffExit(towardPos?: RoomPosition, avoidSwamp = true) {
		return Movement.moveOffExit(this, towardPos, avoidSwamp);
	}

	// Miscellaneous fun stuff -----------------------------------------------------------------------------------------

	sayLoop(messageList: string[], pub?: boolean) {
		return this.say(messageList[Game.time % messageList.length], pub);
	}

	sayRandom(phrases: string[], pub?: boolean) {
		return this.say(
			phrases[Math.floor(Math.random() * phrases.length)],
			pub
		);
	}
}
