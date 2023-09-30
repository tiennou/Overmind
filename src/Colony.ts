import {assimilationLocked} from './assimilation/decorator';
import {$} from './caching/GlobalCache';
import {log} from './console/log';
import {Roles} from './creepSetups/setups';
// import {DirectivePraise} from './directives/colony/praise';
import {DirectiveExtract} from './directives/resource/extract';
import {DirectiveHarvest, HARVEST_MEM} from './directives/resource/harvest';
import {HiveCluster} from './hiveClusters/_HiveCluster';
import {CommandCenter, CommandCenterMemory} from './hiveClusters/commandCenter';
import {EvolutionChamber} from './hiveClusters/evolutionChamber';
import {Hatchery, HatcheryMemory} from './hiveClusters/hatchery';
// import {PraiseSite} from './hiveClusters/praiseSite';
import {SporeCrawler} from './hiveClusters/sporeCrawler';
import {UpgradeSite} from './hiveClusters/upgradeSite';
import {CombatIntel} from './intel/CombatIntel';
import {Energetics} from './logistics/Energetics';
import {LinkNetwork} from './logistics/LinkNetwork';
import {LogisticsNetwork, LogisticsNetworkMemory} from './logistics/LogisticsNetwork';
import {RoadLogistics} from './logistics/RoadLogistics';
import {SpawnGroup} from './logistics/SpawnGroup';
import {TransportRequestGroup} from './logistics/TransportRequestGroup';
import {Mem} from './memory/Memory';
import {DefaultOverlord} from './overlords/core/default';
import {TransportOverlord} from './overlords/core/transporter';
import {WorkerOverlord} from './overlords/core/worker';
import {RandomWalkerScoutOverlord} from './overlords/scouting/randomWalker';
import {profile} from './profiler/decorator';
import {ALL_ZERO_ASSETS} from './resources/map_resources';
import {bunkerLayout, getPosFromBunkerCoord} from './roomPlanner/layouts/bunker';
import {RoomPlanner} from './roomPlanner/RoomPlanner';
import {LOG_STATS_INTERVAL, Stats} from './stats/stats';
import {ColonyExpansionData, EXPANSION_EVALUATION_FREQ, ExpansionEvaluator} from './strategy/ExpansionEvaluator';
import {Cartographer, ROOMTYPE_CONTROLLER} from './utilities/Cartographer';
import {derefRoomPosition, maxBy, mergeSum, minBy} from './utilities/utils';
import {Visualizer} from './visuals/Visualizer';
import {Zerg} from './zerg/Zerg';
import { CombatCreepSetup } from 'creepSetups/CombatCreepSetup';
import { CreepSetup } from 'creepSetups/CreepSetup';

export enum DEFCON {
	safe               = 0,
	invasionNPC        = 1,
	boostedInvasionNPC = 2,
	playerInvasion     = 3,
	bigPlayerInvasion  = 4,
}

export function getAllColonies(): Colony[] {
	return _.values(Overmind.colonies);
}

export interface BunkerData {
	anchor: RoomPosition;
	topSpawn: StructureSpawn | undefined;
	coreSpawn: StructureSpawn | undefined;
	rightSpawn: StructureSpawn | undefined;
}

export interface ColonyMemory {
	defcon: {
		level: DEFCON,
		tick: number,
	};
	expansionData: ColonyExpansionData;
	maxLevel: number;
	outposts: { [roomName: string]: OutpostData };
	suspend?: boolean;
	debug?: boolean;
	persistent?: boolean;
	evolutionChamber?: {
		activeReaction: never;
		reactionQueue: never;
		status: never;
		statusTick: never;
	};
	roomPlanner?: {
		lastGenerated: number;
	};
	roadPlanner?: {
		roadCoordsPacked: { [roomName: string]: string };
	};
	barrierPlanner?: {
		barrierCoordsPacked: string;
	};
	sporeCrawler?: {};
	hatchery?: HatcheryMemory;
	commandCenter?: CommandCenterMemory;
	upgradeSite?: any;
	logisticsNetwork?: LogisticsNetworkMemory;
}

// Outpost that is currently not being maintained
export interface OutpostData {
	active: boolean;
	suspendReason?: OutpostDisableReason;
	[MEM.EXPIRATION]?: number; // Tick to recalculate
}

export enum OutpostDisableReason {
	active             = 'active',
	inactiveCPU        = 'i_cpu', // CPU limitations
	inactiveUpkeep     = 'i_upkeep', // room can't sustain this remote because rebooting, spawn pressure, etc
	inactiveHarassment = 'i_harassment',
	inactiveStronghold = 'i_stronghold',
}

const getDefaultColonyMemory: () => ColonyMemory = () => ({
	defcon       : {
		level: DEFCON.safe,
		tick : -Infinity
	},
	expansionData: {
		possibleExpansions: {},
		expiration        : 0,
	},
	maxLevel     : 0,
	outposts     : {},
});

/**
 * Colonies are the highest-level object other than the global Overmind. A colony groups together all rooms, structures,
 * creeps, utilities, etc. which are run from a single owned room.
 */
@profile
@assimilationLocked
export class Colony {
	/** Colony memory */
	memory: ColonyMemory;
	/** Room associations */
	/** Name of the primary colony room */
	name: string;
	/** Primary (owned) room of the colony */
	room: Room;
	ref: string;
	/** Order in which colony is instantiated from Overmind */
	id: number;
	/** The names of all rooms including the primary room */
	roomNames: string[];
	/** Rooms for remote resource collection */
	outposts: Room[];
	/** Outposts that are not currently maintained, not used for now */
	// abandonedOutposts: AbandonedOutpost[];
	/** All rooms including the primary room */
	rooms: Room[];
	pos: RoomPosition;
	assets: StoreContents;

	// Physical colony structures and roomObjects
	controller: StructureController;					// These are all duplicated from room properties
	spawns: StructureSpawn[];							// |
	extensions: StructureExtension[];					// |
	storage: StructureStorage | undefined;				// |
	links: StructureLink[];								// |
	availableLinks: StructureLink[];					// | links available to claim
	terminal: StructureTerminal | undefined;			// |
	factory: StructureFactory | undefined;				// |
	towers: StructureTower[];							// |
	labs: StructureLab[];								// |
	powerSpawn: StructurePowerSpawn | undefined;		// |
	nuker: StructureNuker | undefined;					// |
	observer: StructureObserver | undefined;			// |
	/** Tombstones in all colony rooms */
	tombstones: Tombstone[];
	/** Dropped resources in all colony rooms */
	drops: { [resourceType: string]: Resource[] };
	/** Ruins in all colony rooms */
	ruins: Ruin[];
	/** Sources in all colony rooms */
	sources: Source[];
	/** All extractors in owned and remote rooms */
	extractors: StructureExtractor[];
	/** Flags assigned to the colony */
	flags: Flag[];
	/** Construction sites in all colony rooms */
	constructionSites: ConstructionSite[];
	/** Repairable structures, discounting barriers and roads */
	repairables: Structure[];
	/** Things that can be recharged from */
	rechargeables: rechargeObjectType[];
	destinations: { pos: RoomPosition, order: number }[];

	// Hive clusters
	/** List of all hive clusters */
	hiveClusters: HiveCluster[];
	/** Component with logic for non-spawning structures */
	commandCenter: CommandCenter | undefined;
	/** Component to encapsulate spawner logic */
	hatchery: Hatchery | undefined;
	/** Temporary spawn group to use when colonizing */
	spawnGroup: SpawnGroup | undefined;
	/** Component for mineral processing */
	evolutionChamber: EvolutionChamber | undefined;
	/** Component to provide upgraders with uninterrupted energy */
	upgradeSite: UpgradeSite;
	/** Component to defend the colony */
	sporeCrawler: SporeCrawler;
	/** Component with logic for mining and hauling */
	miningSites: { [flagName: string]: DirectiveHarvest };
	/** Component with logic for resouce extraction */
	extractionSites: { [flagName: string]: DirectiveExtract };

	// Operational state
	/** Level of the colony's main room */
	level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

	/** The military alert state of the colony */
	get defcon() {
		return this.memory.defcon.level;
	}

	set defcon(level: DEFCON) {
		if (level < DEFCON.safe || level > DEFCON.bigPlayerInvasion) return;
		this.memory.defcon = {
			level: level,
			tick : Game.time
		};
	}

	/** Various flags tracking the colony's state */
	state: {
		/** Whether colony is bootstrapping or recovering from crash */
		bootstrapping?: boolean;
		/** If the colony is incubating */
		isIncubating?: boolean;
		/** Activate if RCL8 and full energy */
		lowPowerMode?: boolean;
		/** If colony is doing major reconstruction (e.g. moving in room) */
		isRebuilding?: boolean;
		/** If we're clearing the terminal if colony is about to fail */
		isEvacuating?: boolean;
		/** If the colony is currently targetted by a nuke */
		isBeingNuked?: boolean;
	};
	/** Which room design colony uses */
	layout: 'twoPart' | 'bunker';
	/** The center tile of the bunker, else undefined */
	bunker: BunkerData | undefined;
	// Creeps and subsets
	/** Creeps bound to the colony */
	creeps: AnyCreep[];
	/** Creeps hashed by their role name */
	creepsByRole: { [roleName: string]: AnyCreep[] };
	// Resource requests
	linkNetwork: LinkNetwork;
	logisticsNetwork: LogisticsNetwork;
	transportRequests: TransportRequestGroup;
	// Overlords
	overlords: {
		default: DefaultOverlord;
		work: WorkerOverlord;
		logistics: TransportOverlord;
		scout?: RandomWalkerScoutOverlord;
	};
	// Road network
	roadLogistics: RoadLogistics;
	// Room planner
	roomPlanner: RoomPlanner;
	// abathur: Abathur;

	static settings = {
		remoteSourcesByLevel: {
			1: 1,
			2: 2,
			3: 3,
			4: 4,
			5: 5,
			6: 6,
			7: 7,
			8: 9,
		},
		maxSourceDistance   : 100
	};

	constructor(id: number, roomName: string, outposts: string[]) {
		// Primitive colony setup
		this.id = id;
		this.name = roomName;
		this.ref = roomName;
		this.memory = Mem.wrap(Memory.colonies, roomName, getDefaultColonyMemory);
		// Format outpost state memory
		_.forEach(outposts, outpost => {
			if (!this.memory.outposts[outpost]) {
				this.memory.outposts[outpost] = {active: true};
			}
		});
		_.forEach(_.keys(_.clone(this.memory.outposts)), roomName => {
			if (!outposts.includes(roomName)) {
				delete this.memory.outposts[roomName];
			}
		});
		// Register colony globally to allow 'W1N1' and 'w1n1' to refer to Overmind.colonies.W1N1
		// @ts-expect-error global getter for Colonies
		global[this.name] = this;
		// @ts-expect-error global getter for Colonies
		global[this.name.toLowerCase()] = this;
		// Build the colony
		this.build(roomName, outposts);
	}

	/**
	 * Pretty-print the colony name in the console
	 */
	get print(): string {
		return '<a href="#!/room/' + Game.shard.name + '/' + this.room.name + '">[' + this.name + ']</a>';
	}

	/**
	 * Pretty-print the colony colony name right-padded with spaces to fit E**S** in the console
	 */
	get printAligned(): string {
		const msg = '<a href="#!/room/' + Game.shard.name + '/' + this.room.name + '">[' + this.name + ']</a>';
		const extraSpaces = 'E12S34'.length - this.room.name.length;
		return msg + ' '.repeat(extraSpaces);
	}

	toString(): string {
		return this.print;
	}

	protected debug(...args: string[]) {
		if (this.memory.debug) {
			log.alert(this.print, ...args);
		}
	}

	/**
	 * Builds the colony object
	 */
	build(roomName: string, outposts: string[]): void {
		// Register rooms
		this.room = Game.rooms[roomName];
		this.roomNames = [roomName].concat(outposts);
		// Register outposts
		this.outposts = _.compact(_.map(outposts, outpost => Game.rooms[outpost]));
		this.rooms = [this.room].concat(this.outposts);
		this.miningSites = {}; 				// filled in by harvest directives
		this.extractionSites = {};			// filled in by extract directives
		// this.praiseSite = undefined;
		// Register creeps
		this.creeps = Overmind.cache.creepsByColony[this.name] || [];
		this.creepsByRole = _.groupBy(this.creeps, creep => creep.memory.role);
		// Register the rest of the colony components; the order in which these are called is important!
		this.registerRoomObjects_cached();	// Register real colony components
		this.registerOperationalState();	// Set the colony operational state
		this.registerUtilities(); 			// Register logistics utilities, room planners, and layout info
		this.registerHiveClusters(); 		// Build the hive clusters
		/* Colony.spawnMoarOverlords() gets called from Overmind.ts, along with Directive.spawnMoarOverlords() */
	}

	/**
	 * Refreshes the state of the colony object
	 */
	refresh(): void {
		this.memory = Memory.colonies[this.room.name];
		// Refresh rooms
		this.room = Game.rooms[this.room.name];
		const outpostRoomNames = _.filter(this.roomNames, roomName => this.room.name != roomName);
		this.outposts =  _.compact(_.map(outpostRoomNames, outpost => Game.rooms[outpost]));
		this.rooms = [this.room].concat(this.outposts);
		// refresh creeps
		this.creeps = Overmind.cache.creepsByColony[this.name] || [];
		this.creepsByRole = _.groupBy(this.creeps, creep => creep.memory.role);
		// Register the rest of the colony components; the order in which these are called is important!
		this.refreshRoomObjects();
		this.registerOperationalState();
		this.refreshUtilities();
		this.refreshHiveClusters();
	}

	/**
	 * Registers physical game objects to the colony
	 */
	private registerRoomObjects(): void {
		// Create placeholder arrays for remaining properties to be filled in by the Overmind
		this.flags = []; // filled in by directives
		this.destinations = []; // filled in by various hive clusters and directives
		// Register room objects across colony rooms
		this.controller = this.room.controller!; // must be controller since colonies are based in owned rooms
		this.spawns = _.sortBy(_.filter(this.room.spawns, spawn => spawn.my && spawn.isActive()), spawn => spawn.ref);
		this.extensions = this.room.extensions;
		this.storage = this.room.storage && this.room.storage.isActive() ? this.room.storage : undefined;
		this.links = this.room.links;
		this.availableLinks = _.clone(this.room.links);
		this.terminal = this.room.terminal && this.room.terminal.isActive() ? this.room.terminal : undefined;
		this.factory = this.room.factory && this.room.factory.isActive() ? this.room.factory : undefined;
		this.towers = this.room.towers;
		this.labs = _.sortBy(_.filter(this.room.labs, lab => lab.my && lab.isActive()),
							 lab => 50 * lab.pos.y + lab.pos.x); // Labs are sorted in reading order of positions
		this.powerSpawn = this.room.powerSpawn;
		this.nuker = this.room.nuker;
		this.observer = this.room.observer;
		this.pos = (this.storage || this.terminal || this.spawns[0] || this.controller).pos;
		// Register physical objects across all rooms in the colony
		this.sources = _.sortBy(_.flatten(_.map(this.rooms, room => room.sources)),
								source => source.pos.getMultiRoomRangeTo(this.pos));
		this.extractors = _(this.rooms)
			.map(room => room.extractor)
			.compact()
			.filter(extractor => (extractor!.my && extractor!.room.my)
								 || Cartographer.roomType(extractor!.room.name) != ROOMTYPE_CONTROLLER)
			.sortBy(extractor => extractor!.pos.getMultiRoomRangeTo(this.pos)).value() as StructureExtractor[];
		this.constructionSites = _.flatten(_.map(this.rooms, room => room.constructionSites));
		this.tombstones = _.flatten(_.map(this.rooms, room => room.tombstones));
		this.drops = _.merge(_.map(this.rooms, room => room.drops));
		this.ruins = _.merge(_.map(this.rooms, room => room.ruins));
		this.repairables = _.flatten(_.map(this.rooms, room => room.repairables));
		this.rechargeables = _.flatten(_.map(this.rooms, room => room.rechargeables));
		// Register assets
		this.assets = this.computeAssets();
	}

	/**
	 * Version of Colony.registerRoomObjects with additional caching functionality
	 */
	private registerRoomObjects_cached(): void {
		// Create placeholder arrays for remaining properties to be filled in by the Overmind
		this.flags = []; // filled in by directives
		this.destinations = []; // filled in by various hive clusters and directives
		// Register room objects across colony rooms
		this.controller = this.room.controller!; // must be controller since colonies are based in owned rooms
		this.extensions = this.room.extensions;
		this.links = this.room.links;
		this.availableLinks = _.clone(this.room.links);
		this.towers = this.room.towers;
		this.powerSpawn = this.room.powerSpawn;
		this.nuker = this.room.nuker;
		this.observer = this.room.observer;
		$.set(this, 'spawns', () => _.sortBy(_.filter(this.room.spawns,
													  spawn => spawn.my && spawn.isActive()), spawn => spawn.ref));
		$.set(this, 'storage', () => this.room.storage && this.room.storage.isActive() ? this.room.storage : undefined);
		$.set(this, 'terminal',
			() => this.room.terminal && this.room.terminal.isActive() ? this.room.terminal : undefined);
		$.set(this, 'factory', () => this.room.factory && this.room.factory.isActive() ? this.room.factory : undefined);
		$.set(this, 'labs', () => _.sortBy(_.filter(this.room.labs, lab => lab.my && lab.isActive()),
										   lab => 50 * lab.pos.y + lab.pos.x));
		this.pos = (this.storage || this.terminal || this.spawns[0] || this.controller).pos;
		// Register physical objects across all rooms in the colony
		$.set(this, 'sources', () => _.sortBy(_.flatten(_.map(this.rooms, room => room.sources)),
											  source => source.pos.getMultiRoomRangeTo(this.pos)));
		$.set(this, 'extractors', () =>
			_(this.rooms)
				.map(room => room.extractor)
				.compact()
				.filter(e => (e!.my && e!.room.my)
							 || Cartographer.roomType(e!.room.name) != ROOMTYPE_CONTROLLER)
				.sortBy(e => e!.pos.getMultiRoomRangeTo(this.pos)).value() as StructureExtractor[]);
		$.set(this, 'repairables', () => _.flatten(_.map(this.rooms, room => room.repairables)));
		$.set(this, 'rechargeables', () => _.flatten(_.map(this.rooms, room => room.rechargeables)));
		$.set(this, 'constructionSites', () => _.flatten(_.map(this.rooms, room => room.constructionSites)), 10);
		$.set(this, 'tombstones', () => _.flatten(_.map(this.rooms, room => room.tombstones)), 5);
		this.drops = _.merge(_.map(this.rooms, room => room.drops));
		$.set(this, 'ruins', () => _.flatten(_.map(this.rooms, room => room.ruins)), 5);
		// Register assets
		this.assets = this.computeAssets();
	}

	/**
	 * Refresh the state of all physical game objects in the colony
	 */
	private refreshRoomObjects(): void {
		$.refresh(this, 'controller', 'extensions', 'links', 'towers', 'powerSpawn', 'nuker', 'observer', 'spawns',
				  'storage', 'terminal', 'factory', 'labs', 'sources', 'extractors', 'constructionSites', 'repairables',
				  'rechargeables', 'ruins');
		$.set(this, 'constructionSites', () => _.flatten(_.map(this.rooms, room => room.constructionSites)), 10);
		$.set(this, 'tombstones', () => _.flatten(_.map(this.rooms, room => room.tombstones)), 5);
		this.drops = _.merge(_.map(this.rooms, room => room.drops));
		$.set(this, 'ruins', () => _.flatten(_.map(this.rooms, room => room.ruins)), 5);
		// Re-compute assets
		this.assets = this.computeAssets();
	}

	/**
	 * Registers the operational state of the colony, computing things like colony maturity, DEFCON level, etc.
	 */
	private registerOperationalState(): void {
		this.level = this.controller.level as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
		// Set DEFCON level for the colony
		let defcon = DEFCON.safe;
		const defconDecayTime = 200;
		if (this.room.dangerousHostiles.length > 0 && !this.controller.safeMode) {
			const playerHostileCount = _.sum(this.room.dangerousPlayerHostiles,
				hostile => CombatIntel.uniqueBoosts(hostile).length > 0 ? 2 : 1);
			const hostileCount = _.sum(this.room.dangerousHostiles,
				hostile => CombatIntel.uniqueBoosts(hostile).length > 0 ? 2 : 1);
			if (playerHostileCount >= 3) {
				defcon = DEFCON.bigPlayerInvasion;
			} else if (playerHostileCount >= 1) {
				defcon = DEFCON.playerInvasion;
			} else if (hostileCount >= 3) {
				defcon = DEFCON.boostedInvasionNPC;
			} else {
				defcon = DEFCON.invasionNPC;
			}
		}
		if (defcon !== this.defcon) {
			if (defcon < this.defcon) { // decay defcon level over time if defcon less than memory value
				if (this.memory.defcon.tick + defconDecayTime < Game.time) {
					log.info(`Colony DEFCON level lowered to ${defcon}`);
					this.defcon = defcon;
				}
			} else if (defcon > this.defcon) { // refresh defcon time if it increases by a level
				log.alert(`Colony DEFCON level raised to ${defcon}!`);
				this.defcon = defcon;
			}
		}

		// Set colony state to blank - other directives can modify this
		this.state = {};
		if (Energetics.lowPowerMode(this)) {
			this.state.lowPowerMode = true;
		}
	}

	/**
	 * Registers utility classes such as logistics networks
	 */
	private registerUtilities(): void {
		// Resource requests
		this.linkNetwork = new LinkNetwork(this);
		this.logisticsNetwork = new LogisticsNetwork(this);
		this.transportRequests = new TransportRequestGroup();
		// Register a room planner
		this.roomPlanner = new RoomPlanner(this);
		if (this.roomPlanner.memory.bunkerData && this.roomPlanner.memory.bunkerData.anchor) {
			this.layout = 'bunker';
			const anchor = derefRoomPosition(this.roomPlanner.memory.bunkerData.anchor);
			// log.debug(JSON.stringify(`anchor for ${this.name}: ${anchor}`));
			const spawnPositions = _.map(bunkerLayout[8]!.buildings.spawn.pos, c => getPosFromBunkerCoord(c, this));
			// log.debug(JSON.stringify(`spawnPositions for ${this.name}: ${spawnPositions}`));
			const rightSpawnPos = maxBy(spawnPositions, pos => pos.x) as RoomPosition;
			const topSpawnPos = minBy(spawnPositions, pos => pos.y) as RoomPosition;
			const coreSpawnPos = anchor.findClosestByRange(spawnPositions) as RoomPosition;
			// log.debug(JSON.stringify(`spawnPoses: ${rightSpawnPos}, ${topSpawnPos}, ${coreSpawnPos}`));
			this.bunker = {
				anchor    : anchor,
				topSpawn  : topSpawnPos.lookForStructure(STRUCTURE_SPAWN),
				coreSpawn : coreSpawnPos.lookForStructure(STRUCTURE_SPAWN),
				rightSpawn: rightSpawnPos.lookForStructure(STRUCTURE_SPAWN),
			};
		} else {
			this.layout = 'twoPart';
		}
		// Register road network
		this.roadLogistics = new RoadLogistics(this);
		// // "Organism Abathur with you."
		// this.abathur = new Abathur(this);
		// Add colony to TerminalNetwork if applicable
		if (this.terminal) {
			Overmind.terminalNetwork.addColony(this);
		}
	}

	/**
	 * Calls utility.refresh() for each registered utility
	 */
	private refreshUtilities(): void {
		this.linkNetwork.refresh();
		this.logisticsNetwork.refresh();
		this.transportRequests.refresh();
		this.roomPlanner.refresh();
		if (this.bunker) {
			if (this.bunker.topSpawn) {
				this.bunker.topSpawn = Game.getObjectById(this.bunker.topSpawn.id) as StructureSpawn | undefined;
			}
			if (this.bunker.coreSpawn) {
				this.bunker.coreSpawn = Game.getObjectById(this.bunker.coreSpawn.id) as StructureSpawn | undefined;
			}
			if (this.bunker.rightSpawn) {
				this.bunker.rightSpawn = Game.getObjectById(this.bunker.rightSpawn.id) as StructureSpawn | undefined;
			}
		}
		this.roadLogistics.refresh();
		// this.abathur.refresh();
	}

	/**
	 * Builds hive clusters for each structural group in a colony
	 */
	private registerHiveClusters(): void {
		this.hiveClusters = [];
		// Instantiate the command center if there is storage in the room - this must be done first!
		if (this.storage) {
			this.commandCenter = new CommandCenter(this, this.storage);
		}
		// Instantiate the hatchery - the incubation directive assignes hatchery to incubator's hatchery if none exists
		if (this.spawns[0]) {
			this.hatchery = new Hatchery(this, this.spawns[0]);
		}
		// Instantiate evolution chamber once there are three labs all in range 2 of each other
		if (this.terminal && _.filter(this.labs, lab =>
			_.all(this.labs, otherLab => lab.pos.inRangeTo(otherLab, 2))).length >= 3) {
			this.evolutionChamber = new EvolutionChamber(this, this.terminal);
		}
		// Instantiate the upgradeSite
		this.upgradeSite = new UpgradeSite(this, this.controller);
		// Instantiate spore crawlers to wrap towers
		if (this.towers[0]) {
			this.sporeCrawler = new SporeCrawler(this, this.towers[0]);
		}
		// Reverse the hive clusters for correct order for init() and run()
		this.hiveClusters.reverse();
	}

	/**
	 * Refreshes the state of each hive cluster
	 */
	private refreshHiveClusters(): void {
		for (let i = this.hiveClusters.length - 1; i >= 0; i--) {
			this.hiveClusters[i].refresh();
		}
	}

	/**
	 * Returns whether a room is part of this colony and is actively being maintained
	 */
	isRoomActive(roomName: string): boolean {
		if (roomName == this.room.name) {
			return true;
		} else if (!this.roomNames.includes(roomName)) {
			return false;
		} else {
			return this.memory.outposts[roomName] && this.memory.outposts[roomName].active;
		}
	}

	/**
	 * Deactivates an outpost and suspends operations in that room
	 */
	suspendOutpost(roomName: string, reason: OutpostDisableReason, duration: number): void {
		this.memory.outposts[roomName] = {
			active          : false,
			suspendReason   : reason,
			[MEM.EXPIRATION]: Game.time + duration
		};
	}

	private handleReactivatingOutposts(): void {
		for (const roomName in this.memory.outposts) {
			const outpostData = this.memory.outposts[roomName];
			if (!outpostData.active && Game.time >= (outpostData[MEM.EXPIRATION] || Infinity)) {
				this.memory.outposts[roomName] = {active: true};
			}
		}
	}

	/**
	 * Instantiate all overlords for the colony
	 */
	spawnMoarOverlords(): void {
		this.overlords = {
			default  : new DefaultOverlord(this),
			work     : new WorkerOverlord(this),
			logistics: new TransportOverlord(this),
		};
		if (!this.observer) {
			this.overlords.scout = new RandomWalkerScoutOverlord(this);
		}
		for (const hiveCluster of this.hiveClusters) {
			hiveCluster.spawnMoarOverlords();
		}
	}

	/**
	 * Get a list of creeps in the colony which have a specified role name
	 */
	getCreepsByRole(roleName: string): AnyCreep[] {
		return this.creepsByRole[roleName] || [];
	}

	/**
	 * Get a list of zerg in the colony which have a specified role name
	 */
	getZergByRole(roleName: string): Zerg[] {
		return _.compact(_.map(this.getCreepsByRole(roleName), creep => Overmind.zerg[creep.name]));
	}

	/**
	 * Check a given creep against a specific setup
	 *
	 * This will return true if the creep has all types of body parts the setup would create,
	 * though not necessarily as many of them.
	 */
	private hasCompatibleBody(creep: Zerg, setup: CreepSetup | CombatCreepSetup): boolean {
		let body: BodyPartConstant[];
		if (setup instanceof CreepSetup) {
			body = setup.generateBody(this.room.energyCapacityAvailable);
		} else if (setup instanceof CombatCreepSetup) {
			body = setup.create(this, true).body;
		} else {
			log.warning(`not sure what to do with ${setup}`);
			return false;
		}
		return body.every(part => creep.creep.getActiveBodyparts(part) !== 0);
	}

	/**
	 * Reassigns a zerg to this colony.
	 *
	 * This will check the to-be-reassigned zerg against the current list of
	 * spawn requests, picking the first one whose body requirements match the creep.
	 * With a role given, it will also ensure that it matches the spawn request.
	 */
	reassign(creep: Zerg, roleName?: string) {
		if (!(creep instanceof Zerg)) {
			log.warning(`invalid value: ${creep}`);
			return false;
		}
		for (const request of this.hatchery?.spawnRequests ?? []) {
			if ((request.setup.role === roleName || !roleName) && this.hasCompatibleBody(creep, request.setup)) {
				log.info(`${this.print} reassigning ${creep.print} to ${request.overlord.print} as ${request.setup.role}`);
				creep.reassign(request.overlord, request.setup.role);
				return true;
			}
		}
		return false;
	}

	/**
	 * Summarizes the total of all resources in colony store structures, labs, and some creeps. Will always return
	 * 0 for an asset that it has none of (not undefined)
	 */
	private computeAssets(verbose = false): StoreContents {
		// Include storage structures, lab contents, and manager carry
		const assetStructures = _.compact([this.storage, this.terminal, this.factory, ...this.labs]);
		const assetCreeps = [...this.getCreepsByRole(Roles.queen), ...this.getCreepsByRole(Roles.manager)];
		const assetStores = _.map([...assetStructures, ...assetCreeps], thing => thing!.store);

		const allAssets = mergeSum(...assetStores, ALL_ZERO_ASSETS);

		if (verbose) log.debug(`${this.room.print} assets: ` + JSON.stringify(allAssets));
		return allAssets;
	}

	/**
	 * Calculate the total amount of energy harvested by the colony
	 */
	get energyMinedPerTick() {
		return $.number(this, 'energyMinedPerTick', () => {
			return _.sum(_.map(this.miningSites, site => {
				const overlord = site.overlords.mine;
				const miningPowerAssigned = _.sum(overlord.miners, miner => miner.getActiveBodyparts(WORK));
				const saturation = miningPowerAssigned / overlord.miningPowerNeeded;
				return overlord.energyPerTick * saturation;
			}));
		}, 5);
	}

	/**
	 * Initializes the state of the colony each tick
	 */
	init(): void {
		_.forEach(this.hiveClusters, hiveCluster => hiveCluster.init());	// Initialize each hive cluster
		this.roadLogistics.init();											// Initialize the road network
		this.linkNetwork.init();											// Initialize link network
		this.roomPlanner.init();											// Initialize the room planner
		if (Game.time % EXPANSION_EVALUATION_FREQ == 5 * this.id) {			// Re-evaluate expansion data if needed
			ExpansionEvaluator.refreshExpansionData(this.memory.expansionData, this.room.name);
		}
	}

	/**
	 * Runs the colony, performing state-changing actions each tick
	 */
	run(): void {
		_.forEach(this.hiveClusters, hiveCluster => hiveCluster.run());		// Run each hive cluster
		this.linkNetwork.run();												// Run the link network
		this.roadLogistics.run();											// Run the road network
		this.roomPlanner.run();												// Run the room planner
		this.stats();														// Log stats per tick

		if (this.logisticsNetwork.memory.debug) {
			this.logisticsNetwork.summarize();
			this.logisticsNetwork.summarizeMatching();
		}
	}

	/**
	 * Register colony-wide statistics
	 */
	stats(): void {
		if (Game.time % LOG_STATS_INTERVAL == 0) {
			// Log energy and rcl
			Stats.log(`colonies.${this.name}.storage.energy`, this.storage ? this.storage.energy : undefined);
			Stats.log(`colonies.${this.name}.rcl.level`, this.controller.level);
			Stats.log(`colonies.${this.name}.rcl.progress`, this.controller.progress);
			Stats.log(`colonies.${this.name}.rcl.progressTotal`, this.controller.progressTotal);
			// Log average miningSite usage and uptime and estimated colony energy income
			const numSites = _.keys(this.miningSites).length;
			const avgDowntime = _.sum(this.miningSites, site => site.memory[HARVEST_MEM.DOWNTIME]) / numSites;
			const avgUsage = _.sum(this.miningSites, site => site.memory[HARVEST_MEM.USAGE]) / numSites;
			const energyInPerTick = _.sum(this.miningSites,
										  site => site.overlords.mine.energyPerTick * site.memory[HARVEST_MEM.USAGE]);
			Stats.log(`colonies.${this.name}.miningSites.avgDowntime`, avgDowntime);
			Stats.log(`colonies.${this.name}.miningSites.avgUsage`, avgUsage);
			Stats.log(`colonies.${this.name}.miningSites.energyInPerTick`, energyInPerTick);
			Stats.log(`colonies.${this.name}.assets`, this.assets);
			// Log defensive properties
			Stats.log(`colonies.${this.name}.defcon`, this.defcon);
			Stats.log(`colonies.${this.name}.threatLevel`, this.room.threatLevel);
			const avgBarrierHits = _.sum(this.room.barriers, barrier => barrier.hits) / this.room.barriers.length;
			Stats.log(`colonies.${this.name}.avgBarrierHits`, avgBarrierHits);
			const report = Overmind.overseer.getCreepReport(this);
			for (const [role, [current, needed]] of Object.entries(report)) {
				Stats.log(`colonies.${this.name}.creeps.${role}.current`, current);
				Stats.log(`colonies.${this.name}.creeps.${role}.needed`, needed);
			}
		}
	}

	private drawCreepReport(coord: Coord): Coord {
		let {x, y} = coord;
		const report = Overmind.overseer.getCreepReport(this);

		const roledata: string[][] = [];
		for (const role in report) {
			const [current, needed] = report[role];
			roledata.push([role, `${current}/${needed}`]);
		}

		const tablePos = new RoomPosition(x, y, this.room.name);
		y = Visualizer.infoBox(`${this.name} Creeps`, roledata, tablePos, 7);
		return {x, y};
	}

	visuals(): void {
		let coord: Coord = {x: 1, y: 11.5};
		coord = this.drawCreepReport(coord);

		const overlords = [
			this.hatchery,
			this.commandCenter,
			this.evolutionChamber,
			this.upgradeSite,
		];
		for (const hiveCluster of _.compact(overlords)) {
			coord = hiveCluster!.visuals(coord);
		}
	}
}
