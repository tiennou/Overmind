import { Colony, getAllColonies } from "./Colony";
import { log } from "./console/log";
import { bodyCost } from "./creepSetups/CreepSetup";
import { Roles } from "./creepSetups/setups";
import { DirectiveColonize } from "./directives/colony/colonize";
import { DirectiveOutpost } from "./directives/colony/outpost";
import { DirectivePoisonRoom } from "./directives/colony/poisonRoom";
import { DirectiveGuard } from "./directives/defense/guard";
import { DirectiveInvasionDefense } from "./directives/defense/invasionDefense";
import { DirectiveOutpostDefense } from "./directives/defense/outpostDefense";
import { Directive } from "./directives/Directive";
import { Notifier } from "./directives/Notifier";
import { DirectiveExtract } from "./directives/resource/extract";
import { DirectiveHarvest } from "./directives/resource/harvest";
import { DirectivePowerMine } from "./directives/resource/powerMine";
import { DirectiveBootstrap } from "./directives/situational/bootstrap";
import { DirectiveNukeResponse } from "./directives/situational/nukeResponse";
import { DirectiveTerminalEvacuateState } from "./directives/terminalState/terminalState_evacuate";
import { RoomIntel } from "./intel/RoomIntel";
import { LogisticsNetwork } from "./logistics/LogisticsNetwork";
import { Autonomy, getAutonomyLevel, MAX_BUCKET, Mem } from "./memory/Memory";
import { Pathing } from "./movement/Pathing";
import { Overlord } from "./overlords/Overlord";
import { profile } from "./profiler/decorator";
import { CombatPlanner } from "./strategy/CombatPlanner";
import {
	Cartographer,
	ROOMTYPE_ALLEY,
	ROOMTYPE_CONTROLLER,
	ROOMTYPE_CROSSROAD,
	ROOMTYPE_SOURCEKEEPER,
} from "./utilities/Cartographer";
import { p } from "./utilities/random";
import {
	canClaimAnotherRoom,
	entries,
	getAllRooms,
	hasJustSpawned,
	minBy,
	onPublicServer,
} from "./utilities/utils";
import { DirectiveGather } from "directives/resource/gather";
import { DEPOSIT_COOLDOWN_CUTOFF } from "overlords/mining/gatherer";
import {
	SUSPENSION_STRONGHOLD_DEFAULT_DURATION,
	SuspensionReason,
} from "utilities/suspension";

// export const DIRECTIVE_CHECK_FREQUENCY = 2;

interface OverseerMemory {}

const getDefaultOverseerMemory: () => OverseerMemory = () => ({});

/**
 * The Overseer object acts as a scheduler, running directives and overlords for all colonies each tick. It is also
 * in charge of starting new "processes" (directives) to respond to various situations.
 */
@profile
export class Overseer implements IOverseer {
	private memory: OverseerMemory;

	private directives: Directive[];
	private directivesByType: { [directiveName: string]: Directive[] };
	private directivesByRoom: { [roomName: string]: Directive[] };
	private directivesByColony: { [colonyName: string]: Directive[] };

	private overlords: Overlord[];
	private overlordsByColony: { [col: string]: Overlord[] };

	private _directiveCached: boolean;
	private _overlordsCached: boolean;

	private blockedRooms: Set<string>;

	combatPlanner: CombatPlanner;
	notifier: Notifier;

	static settings = {
		outpostCheckFrequency: onPublicServer() ? 250 : 100,
	};

	constructor() {
		this.memory = Mem.wrap(Memory, "overseer", getDefaultOverseerMemory);
		this.directives = [];
		this.overlords = [];
		this.overlordsByColony = {};
		this._overlordsCached = false;
		this.notifier = new Notifier();
		this.combatPlanner = new CombatPlanner();
		this.blockedRooms = new Set();
	}

	refresh() {
		this.memory = Mem.wrap(Memory, "overseer", getDefaultOverseerMemory);
		this.notifier.clear();
	}

	registerDirective(directive: Directive): void {
		this.directives.push(directive);
		this._directiveCached = false;
	}

	removeDirective(directive: Directive): void {
		_.remove(this.directives, (dir) => dir.name == directive.name);
		for (const name in directive.overlords) {
			this.removeOverlord(directive.overlords[name]);
		}
		this._directiveCached = false;
	}

	private ensureDirectivesCached(): void {
		if (!this._directiveCached) {
			this.directivesByType = _.groupBy(
				this.directives,
				(directive) => directive.directiveName
			);
			this.directivesByRoom = _.groupBy(
				this.directives,
				(directive) => directive.pos.roomName
			);
			this.directivesByColony = _.groupBy(
				this.directives,
				(directive) => directive.colony.name || "none"
			);
			this._directiveCached = true;
		}
	}

	getDirectivesOfType(directiveName: string): Directive[] {
		this.ensureDirectivesCached();
		return this.directivesByType[directiveName] ?? [];
	}

	getDirectivesInRoom(roomName: string): Directive[] {
		this.ensureDirectivesCached();
		return this.directivesByRoom[roomName] || [];
	}

	getDirectivesForColony(colony: Colony): Directive[] {
		this.ensureDirectivesCached();
		return this.directivesByColony[colony.name] || [];
	}

	registerOverlord(overlord: Overlord): void {
		this.overlords.push(overlord);
		this._overlordsCached = false;
	}

	private removeOverlord(overlord: Overlord): void {
		_.remove(this.overlords, (o) => o.ref == overlord.ref);
		this._overlordsCached = false;
	}

	private ensureOverlordsCached(): void {
		if (!this._overlordsCached) {
			this.overlords.sort((o1, o2) => o1.priority - o2.priority);
			this.overlordsByColony = _.groupBy(
				this.overlords,
				(overlord) => overlord.colony.name
			);
			for (const colName in this.overlordsByColony) {
				this.overlordsByColony[colName].sort(
					(o1, o2) => o1.priority - o2.priority
				);
			}
			this._overlordsCached = true;
		}
	}

	getOverlordsForColony(colony: Colony): Overlord[] {
		return this.overlordsByColony[colony.name] || [];
	}

	// Initialization ==================================================================================================

	private registerLogisticsRequests(colony: Colony): void {
		// Register logistics requests for all dropped resources and tombstones
		for (const room of colony.rooms) {
			// Pick up all nontrivial dropped resources
			for (const resourceType in room.drops) {
				for (const drop of room.drops[resourceType]) {
					if (
						drop.amount >
							LogisticsNetwork.settings.droppedEnergyThreshold ||
						drop.resourceType != RESOURCE_ENERGY
					) {
						colony.logisticsNetwork.requestOutput(drop, {
							dAmountdt: 1,
						});
					}
				}
			}
		}

		// Pick up all nontrivial ruin resources
		for (const ruin of colony.ruins) {
			if (
				ruin.store.getUsedCapacity() >
					LogisticsNetwork.settings.droppedEnergyThreshold ||
				ruin.store.getUsedCapacity() > ruin.store.energy
			) {
				if (colony.bunker && ruin.pos.isEqualTo(colony.bunker.anchor)) {
					continue;
				}
				colony.logisticsNetwork.requestOutput(ruin, {
					resourceType: "all",
				});
			}
		}

		// Place a logistics request directive for every tombstone with non-empty store that isn't on a container
		for (const tombstone of colony.tombstones) {
			if (
				tombstone.store.getUsedCapacity() >
					LogisticsNetwork.settings.droppedEnergyThreshold ||
				tombstone.store.getUsedCapacity() > tombstone.store.energy
			) {
				if (
					(colony.bunker &&
						tombstone.pos.isEqualTo(colony.bunker.anchor)) ||
					tombstone.pos.lookForStructure(STRUCTURE_CONTAINER)
				) {
					continue;
				}
				colony.logisticsNetwork.requestOutput(tombstone, {
					resourceType: "all",
				});
			}
		}
	}

	init(): void {
		this.ensureDirectivesCached();
		this.ensureOverlordsCached();

		// Initialize directives
		for (const directive of this.directives) {
			directive.debug(`init`);
			directive.init();
		}

		// Initialize overlords
		for (const overlord of this.overlords) {
			overlord.tryInit();
		}

		// Register cleanup requests to logistics network
		for (const colony of getAllColonies()) {
			this.registerLogisticsRequests(colony);
		}
	}

	// Run phase methods ===============================================================================================

	private placeHarvestingDirectives(colony: Colony) {
		for (const source of colony.sources) {
			DirectiveHarvest.createIfNotPresent(source.pos, "pos");
		}
		if (colony.controller.level >= 6 && colony.terminal) {
			_.forEach(colony.extractors, (extractor) =>
				DirectiveExtract.createIfNotPresent(extractor.pos, "pos")
			);
		}
	}

	private placeGatheringDirectives() {
		const gatherDirectives = this.getDirectivesOfType(
			DirectiveGather.directiveName
		);
		for (const [roomName] of entries(Memory.rooms)) {
			const info = RoomIntel.getAllRoomObjectInfo(roomName);
			if (!info || !info.deposits) {
				continue;
			}
			for (const deposit of info.deposits) {
				if (deposit.cooldown >= DEPOSIT_COOLDOWN_CUTOFF) {
					continue;
				}

				if (
					gatherDirectives.some(
						(directive) =>
							deposit.pos.readableName ===
							directive.pos.readableName
					)
				) {
					log.debug(
						`Already found gather directive at ${deposit.pos.print}, skipping`
					);
					continue;
				}

				DirectiveGather.createIfNotPresent(deposit.pos, "pos", {
					memory: { maxLinearRange: 6 },
				});
			}
		}
	}

	private handleBootstrapping(colony: Colony) {
		// Bootstrap directive: in the event of catastrophic room crash, enter emergency spawn mode.
		// Doesn't apply to incubating colonies.
		if (!colony.state.isIncubating) {
			const noQueen = colony.getCreepsByRole(Roles.queen).length == 0;
			if (noQueen && colony.hatchery && !colony.spawnGroup) {
				const setup = colony.hatchery.overlord.queenSetup;
				const energyToMakeQueen = bodyCost(
					setup.generateBody(colony.room.energyCapacityAvailable)
				);
				if (
					colony.room.energyAvailable < energyToMakeQueen ||
					hasJustSpawned()
				) {
					const result = DirectiveBootstrap.createIfNotPresent(
						colony.hatchery.pos,
						"pos"
					);
					if (typeof result === "string") {
						// successfully made flag
						colony.hatchery.settings.suppressSpawning = true;
					}
				}
			}
		}
	}

	private handleOutpostDefense(colony: Colony) {
		// TODO: plug in threatLevel infra
		// Guard directive: defend your outposts and all rooms of colonies that you are incubating
		for (const room of colony.outposts) {
			if (room.dangerousPlayerHostiles.length > 0) {
				// Handle player defense of the main room
				DirectiveOutpostDefense.createIfNotPresent(
					Pathing.findPathablePosition(room.name),
					"room"
				);
			} else if (
				Cartographer.roomType(room.name) === ROOMTYPE_CONTROLLER
			) {
				// Handle NPC invasion directives
				if (
					room.invaders.length > 0 ||
					(room.invaderCore && room.invaderCore.level == 0)
				) {
					const defenseDirectives = [
						...DirectiveGuard.find(room.flags),
						...DirectiveOutpostDefense.find(room.flags),
					];
					if (defenseDirectives.length == 0) {
						const placePos = (room.invaders[0] || room.invaderCore)
							.pos;
						DirectiveGuard.create(placePos);
					}
				}

				// Suspend outpost if the controller has been reserved by someone else
				const controller = room.controller!;
				if (
					room.name !== colony.room.name &&
					controller.reservation &&
					!controller.reservedByMe
				) {
					const duration = controller.reservation.ticksToEnd;
					log.warning(
						`Outpost ${room.name} of ${colony.print} is suspended for ${duration}: controller reserved`
					);
					colony.suspendOutpost(room.name, {
						reason: SuspensionReason.reserved,
						duration,
					});
				}
			}
		}
	}

	// private handleStrongholds(colony: Colony) {
	// 	if (Game.time % 57 == 0) {
	// 		for (const room of colony.outposts) {
	// 			if (room.invaderCore) {
	// 				log.alert(`Found core in ${room.name} with ${room.invaderCore} level ${room.invaderCore.level}`);
	// 				if (room.invaderCore.level == 0) {
	// 					DirectiveModularDismantle.createIfNotPresent(room.invaderCore.pos, 'pos');
	// 				}
	// 				// else if (room.invaderCore.level <= 4 && room.invaderCore.ticksToDeploy) {
	// 				// 	res = DirectiveStronghold.createIfNotPresent(room.invaderCore.pos, 'room');
	// 				// 	if (!!res) {
	// 				// 		log.notify(`Creating inactiveStronghold clearing ranged attacker in room ${room.name}`);
	// 				// 	}
	// 				// }
	// 			}
	// 		}
	// 	}
	// }

	private handleColonyInvasions(colony: Colony, checkPersistent = false) {
		// See if invasion is big enough to warrant creep defenses
		if (!colony.room.isSafe && colony.room.threatLevel > 0.25) {
			if (checkPersistent) {
				// Place defensive directive after hostiles have been present for a long enough time
				const safetyData = RoomIntel.getSafetyData(colony.room.name);
				const invasionIsPersistent = safetyData.unsafeFor > 20;
				if (invasionIsPersistent) {
					DirectiveInvasionDefense.createIfNotPresent(
						colony.controller.pos,
						"room"
					);
				}
			} else {
				DirectiveInvasionDefense.createIfNotPresent(
					colony.controller.pos,
					"room"
				);
			}
		}
	}

	private handleNukeResponse(colony: Colony) {
		// Place nuke response directive if there is a nuke present in colony room
		if (colony.room && colony.level >= DirectiveNukeResponse.requiredRCL) {
			for (const _nuke of colony.room.find(FIND_NUKES)) {
				DirectiveNukeResponse.createIfNotPresent(
					colony.controller.pos,
					"room"
				);
			}
		}
	}

	/**
	 * Creates directives to handle mining from nearby power banks
	 */
	private handlePowerMining(room: Room) {
		const powerSetting = Memory.settings.powerCollection;

		const roomType = Cartographer.roomType(room.name);

		if (
			powerSetting.enabled &&
			(roomType == ROOMTYPE_ALLEY || roomType == ROOMTYPE_CROSSROAD)
		) {
			const powerBank = _.first(room.powerBanks);
			if (
				powerBank &&
				powerBank.ticksToDecay > 4000 &&
				powerBank.power >= powerSetting.minPower
			) {
				if (DirectivePowerMine.isPresent(powerBank.pos)) {
					return;
				}

				const validColonies = _.filter(
					getAllColonies(),
					(colony) =>
						colony.level >= DirectivePowerMine.requiredRCL &&
						Game.map.getRoomLinearDistance(
							colony.name,
							room.name
						) <= powerSetting.maxRange
				);
				for (const colony of validColonies) {
					const route = Game.map.findRoute(
						colony.room,
						powerBank.room
					);
					if (
						route != ERR_NO_PATH &&
						route.length <= powerSetting.maxRange
					) {
						log.info(
							`FOUND POWER BANK IN RANGE ${route.length}, STARTING MINING ${powerBank.room}`
						);
						DirectivePowerMine.create(powerBank.pos);
						return;
					}
				}
			}
		}
	}

	/**
	 * Check if a given room is blocked
	 */
	roomIsBlocked(roomName: string) {
		return this.blockedRooms.has(roomName);
	}

	/**
	 * Mark the given room as blocked
	 */
	blockRoom(roomName: string) {
		this.blockedRooms.add(roomName);
	}

	private computePossibleOutposts(colony: Colony, depth = 3): string[] {
		const colonyRoomStatus = RoomIntel.getRoomStatus(
			colony.room.name
		).status;
		return _.filter(
			Cartographer.findRoomsInRange(colony.room.name, depth),
			(roomName) => {
				if (Cartographer.roomType(roomName) != ROOMTYPE_CONTROLLER) {
					return false;
				}
				const alreadyAnOutpost = _.any(
					Overmind.cache.outpostFlags,
					(flag) =>
						(flag.memory.setPos || flag.pos).roomName == roomName
				);
				const alreadyAColony = !!Overmind.colonies[roomName];
				if (alreadyAColony || alreadyAnOutpost) {
					return false;
				}
				const alreadyOwned = RoomIntel.roomOwnedBy(roomName);
				const alreadyReserved = RoomIntel.roomReservedBy(roomName);
				const isBlocked = this.roomIsBlocked(roomName);
				if (isBlocked) {
					log.info(
						`Room ${roomName} is blocked, not expanding there.`
					);
				}
				if (alreadyOwned || alreadyReserved || isBlocked) {
					return false;
				}
				const neighboringRooms = _.values<string>(
					Cartographer.describeExits(roomName)
				);
				const isReachableFromColony = _.any(neighboringRooms, (r) =>
					colony.roomNames.includes(r)
				);
				return (
					isReachableFromColony &&
					RoomIntel.getRoomStatus(roomName).status ===
						colonyRoomStatus
				);
			}
		);
	}

	private handleNewOutposts(colony: Colony) {
		const numSources = _.sum(
			colony.roomNames, // TODO: rewrite to include suspension?
			(roomName) =>
				Memory.rooms[roomName] && Memory.rooms[roomName][RMEM.SOURCES] ?
					Memory.rooms[roomName][RMEM.SOURCES]!.length
				:	0
		);
		const numRemotes = numSources - colony.room.sources.length;
		if (numRemotes < Colony.settings.remoteSourcesByLevel[colony.level]) {
			const possibleOutposts = this.computePossibleOutposts(colony);

			const origin = colony.pos;
			const bestOutpost = minBy(possibleOutposts, function (outpostName) {
				const sourceInfo = RoomIntel.getSourceInfo(outpostName);
				if (!sourceInfo) {
					return false;
				}
				const sourceDistances = _.map(sourceInfo, (src) =>
					Pathing.distance(origin, src.pos)
				);
				if (
					_.any(
						sourceDistances,
						(dist) =>
							dist == undefined ||
							dist > Colony.settings.maxSourceDistance
					)
				) {
					return false;
				}
				return _.sum(sourceDistances) / sourceDistances.length;
			});

			if (bestOutpost) {
				const pos = Pathing.findPathablePosition(bestOutpost);
				log.info(
					`Colony ${colony.room.print} now remote mining from ${pos.print}`
				);
				DirectiveOutpost.createIfNotPresent(pos, "room", {
					memory: { [MEM.COLONY]: colony.name },
				});
			}
		}
	}

	private handleAutoPoisoning() {
		// Can only have a max number of concurrent poisons at a time
		const poisonDirectives = this.getDirectivesOfType(
			DirectivePoisonRoom.directiveName
		);
		if (
			poisonDirectives.length >= Memory.settings.autoPoison.maxConcurrent
		) {
			return;
		}
		// Find a room to poison
		for (const room of getAllRooms()) {
			if (DirectivePoisonRoom.canAutoPoison(room)) {
				const controller = room.controller!;
				const maxRange = Memory.settings.autoPoison.maxRange;
				if (!DirectivePoisonRoom.isPresent(controller.pos)) {
					// See if you can poison a room
					const colonies = getAllColonies().filter(
						(colony) =>
							colony.level >= DirectivePoisonRoom.requiredRCL &&
							Game.map.getRoomLinearDistance(
								room.name,
								colony.room.name
							) <= maxRange
					);
					for (const colony of colonies) {
						const route = Game.map.findRoute(colony.room, room);
						if (route != ERR_NO_PATH && route.length <= maxRange) {
							log.notify(`Poisoning room ${room.print}`);
							DirectivePoisonRoom.create(controller.pos);
							return;
						}
					}
				}
			}
		}
	}

	/**
	 * Place directives to respond to various conditions
	 */
	private placeDirectives(): void {
		const allRooms = getAllRooms();
		const allColonies = getAllColonies();

		if (LATEST_BUILD_TICK == Game.time) {
			_.forEach(allColonies, (colony) =>
				this.placeHarvestingDirectives(colony)
			);

			this.placeGatheringDirectives();
		}

		_.forEach(allColonies, (colony) => this.handleBootstrapping(colony));

		_.forEach(allColonies, (colony) => this.handleOutpostDefense(colony));

		// _.forEach(allColonies, colony => this.handleStrongholds(colony));

		_.forEach(allColonies, (colony) => this.handleColonyInvasions(colony));

		_.forEach(allColonies, (colony) => this.handleNukeResponse(colony));

		if (Game.time % 100 == 67) {
			_.forEach(allColonies, (colony) =>
				this.handleUnkillableStrongholds(colony)
			);
		}

		if (Memory.settings.powerCollection.enabled && Game.cpu.bucket > 8000) {
			_.forEach(allRooms, (room) => this.handlePowerMining(room));
		}

		if (
			Memory.settings.autoPoison.enabled &&
			canClaimAnotherRoom() &&
			Game.cpu.bucket > 9500
		) {
			if (p(0.05)) {
				this.handleAutoPoisoning();
			}
		}

		if (getAutonomyLevel() > Autonomy.Manual) {
			_.forEach(allColonies, (colony) => {
				if (
					Game.time % Overseer.settings.outpostCheckFrequency ==
					2 * colony.id
				) {
					this.handleNewOutposts(colony);
				}
				// Place pioneer directives in case the colony doesn't have a spawn for some reason
				if (Game.time % 25 == 0 && colony.spawns.length == 0) {
					// verify that there are no spawns (not just a caching glitch)
					if (colony.room.find(FIND_MY_SPAWNS).length == 0) {
						const pos = Pathing.findPathablePosition(
							colony.room.name
						);
						DirectiveColonize.createIfNotPresent(pos, "room");
					}
				}
			});
		}
	}

	// Harass Response =================================================================================================

	private handleUnkillableStrongholds(colony: Colony): void {
		for (const room of colony.outposts) {
			if (
				Cartographer.roomType(room.name) == ROOMTYPE_SOURCEKEEPER &&
				room.invaderCore &&
				room.invaderCore.level > 3
			) {
				log.warning(
					`Disabling outpost ${room.print} due to Stronghold presence`
				);
				colony.suspendOutpost(room.name, {
					reason: SuspensionReason.stronghold,
					duration: SUSPENSION_STRONGHOLD_DEFAULT_DURATION,
				});
			}
		}
	}

	// Safe mode condition =============================================================================================

	private handleSafeMode(colony: Colony): void {
		const hostiles = colony.room.dangerousPlayerHostiles;
		if (!hostiles.length || colony.controller.safeMode) {
			return;
		}

		// Safe mode activates when:
		// - any critical structure has less than 50% hitpoints and there are hostile creeps close by
		// - hostile creeps can path to the spawn
		let activateSafeMode = false;
		const criticalStructures = _.compact([
			...colony.spawns,
			colony.storage,
			colony.terminal,
		]) as Structure[];

		const hasEndangeredStructures = criticalStructures.some((s) => {
			return (
				s.hits < s.hitsMax / 2 &&
				s.pos.findInRange(hostiles, 2).length > 0
			);
		});

		if (hasEndangeredStructures) {
			activateSafeMode = true;
		} else {
			const spawn = colony.spawns[0];
			const closestHostileToSpawn =
				spawn &&
				spawn.pos.findClosestByRange(
					colony.room.dangerousPlayerHostiles
				);
			const barriers = colony.room.barriers.map((b) => b.pos);
			if (
				closestHostileToSpawn &&
				Pathing.isReachable(
					closestHostileToSpawn.pos,
					spawn.pos,
					barriers
				)
			) {
				activateSafeMode = true;
			}
		}

		if (activateSafeMode) {
			const ret = colony.controller.activateSafeMode();
			if (ret != OK && !colony.controller.safeMode) {
				if (colony.terminal) {
					DirectiveTerminalEvacuateState.createIfNotPresent(
						colony.terminal.pos,
						"room"
					);
				}
			}
		}
	}

	// Operation =======================================================================================================

	run(): void {
		for (const directive of this.directives) {
			directive.debug(`run`);
			directive.run();
		}
		for (const overlord of this.overlords) {
			overlord.tryRun();
		}
		for (const colony of getAllColonies()) {
			this.handleSafeMode(colony);
		}

		this.placeDirectives();
	}

	postRun(): void {
		if (Memory.settings.pixelGeneration.enabled) {
			// Make sure that our current bucket delta looks fine so we recover quickly
			const delta = Memory.stats.persistent.avgBucketDelta ?? 0;
			if (delta >= 20 && Game.cpu.bucket === MAX_BUCKET) {
				log.warning(`Generating pixels!`);
				Memory.pixelsTick = Game.time;
				// Reset the last bucket count so we don't tank the average
				Memory.stats.persistent.lastBucket = 0;
				Game.cpu.generatePixel();
			}
		}
	}

	getCreepReport(colony: Colony) {
		const roleOccupancy: { [role: string]: [number, number] } = {};

		for (const overlord of this.overlordsByColony[colony.name]) {
			for (const role in overlord.creepUsageReport) {
				const report = overlord.creepUsageReport[role];
				if (report == undefined) {
					if (Game.time % 100 == 0) {
						log.info(
							`Role ${role} is not reported by ${overlord.ref}!`
						);
					}
				} else {
					if (roleOccupancy[role] == undefined) {
						roleOccupancy[role] = [0, 0];
					}
					roleOccupancy[role][0] += report[0];
					roleOccupancy[role][1] += report[1];
				}
			}
		}
		return roleOccupancy;
	}

	visuals(): void {
		for (const directive of this.directives) {
			directive.visuals();
		}
		for (const overlord of this.overlords) {
			overlord.visuals();
		}
		this.notifier.visuals();
		// for (let colony of this.colonies) {
		// 	this.drawCreepReport(colony);
		// }
		RoomIntel.visuals();
	}
}
