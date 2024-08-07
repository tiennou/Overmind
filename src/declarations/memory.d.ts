type operationMode = "manual" | "semiautomatic" | "automatic";

/**
 * TODO make this an enum
 * 0: Basic
 * 1: Collect from enemy storage/terminal
 * 2: Collect from all sources TBD
 * 3: Collect all and mine walls for energy TBD
 */
type resourceCollectionMode = number;

interface RawMemory {
	_parsed: any;
}

interface MemorySettings {
	signature: string;
	operationMode: operationMode;
	log: import("console/log").LogSettings;
	enableVisuals: boolean;
	intelVisuals: {
		/**
		 * Tick until which the intel room visuals are shown
		 */
		until?: number;
		range?: number;
	};
	allies: string[];
	resourceCollectionMode: resourceCollectionMode;
	powerCollection: {
		enabled: boolean;
		maxRange: number;
		minPower: number;
	};
	autoPoison: {
		enabled: boolean;
		maxRange: number;
		maxConcurrent: number;
	};
	pixelGeneration: {
		enabled: boolean;
	};
	roomPlanner: {
		/** Whether the roomplanner can destroy structures that aren't in its plan */
		allowDestroy: boolean;
	};
	colonization: {
		/** The max number of rooms to colonize. Set to `undefined` to use GCL */
		maxRooms: number | undefined;
		/** How close of another player a room we could expand into can be */
		safeZone: number;
	};
	attitude: {
		/**
		 * How aggressive the AI is
		 * Only used in room hostility checks for now.
		 */
		brazenness: number;
	};
}

interface Memory {
	tick: number;
	build: number;
	Overmind: {
		terminalNetwork?: import("logistics/TerminalNetwork").TerminalNetworkMemory;
		trader?: import("logistics/TradeNetwork").TraderMemory;
		versionMigrator?: { versions: {} };
		versionUpdater?: any;
	};
	profiler: any;
	overseer: any;
	segmenter: import("memory/Segmenter").SegmenterMemory;
	roomIntel: import("intel/RoomIntel").RoomIntelMemory;
	colonies: { [name: string]: import("Colony").ColonyMemory };
	creeps: { [name: string]: CreepMemory };
	powerCreeps: { [name: string]: PowerCreepMemory };
	flags: { [name: string]: FlagMemory };
	rooms: { [name: string]: RoomMemory };
	spawns: { [name: string]: SpawnMemory };
	pathing: PathingMemory;
	constructionSites: { [id: string]: number };
	stats: {
		persistent: {
			time?: number;
			lastGlobalReset?: number;
			lastMemoryReset?: number;
			lastErrorTick?: number;
			globalAge?: number;
			avgCPU?: number;
			empireAge?: number;
			build?: number;
			lastBucket?: number;
			avgBucketDelta?: number;
			terminalNetwork?: import("logistics/TerminalNetwork").TerminalNetworkStats;
			trader?: import("logistics/TradeNetwork").TraderStats;
		};
		"cpu.heapStatistics"?: HeapStatistics;
	};

	// suspend?: number;
	resetBucket?: boolean;
	haltTick?: number;
	pixelsTick?: number;
	combatPlanner: import("strategy/CombatPlanner").CombatPlannerMemory;
	playerCreepTracker: {
		// TODO revisit for a better longterm solution
		[playerName: string]: CreepTracker;
	};
	// zoneRooms: { [roomName: string]: { [type: string]: number } };

	reinforcementLearning?: {
		enabled?: boolean;
		verbosity?: number;
		workerIndex?: number;
	};

	screepsProfiler?: any;

	settings: MemorySettings;

	remoteDebugger: import("debug/remoteDebugger").DebuggerMemory;
	nukePlanner: import("strategy/NukePlanner").NukePlannerMemory;
	expansionPlanner: import("strategy/ExpansionPlanner").ExpansionPlannerMemory;
}

interface StatsMemory {
	cpu: {
		getUsed: number;
		limit: number;
		bucket: number;
		usage: {
			[colonyName: string]: {
				init: number;
				run: number;
				visuals: number;
			};
		};
	};
	gcl: {
		progress: number;
		progressTotal: number;
		level: number;
	};
	colonies: {
		[colonyName: string]: {
			hatchery: {
				uptime: number;
			};
			miningSite: {
				usage: number;
				downtime: number;
			};
			storage: {
				energy: number;
			};
			rcl: {
				level: number;
				progress: number;
				progressTotal: number;
			};
		};
	};
}

interface PublicSegment {}

interface CreepMemory {
	[MEM.OVERLORD]: string | null;
	[MEM.COLONY]: string | null;
	role: string;
	task: import("tasks/types").ProtoTask | null;
	sleepUntil?: number;
	needBoosts?: MineralBoostConstant[];
	data: {
		origin: string;
		/** Bunker Queens only */
		idlePos?: Coord;
	};
	avoidDanger?: {
		start: number;
		timer: number;
		/** The room to flee to, or just a random flee */
		flee: string | true;
	};
	noNotifications?: boolean;
	_go?: MoveData;
	debug?: boolean;
	talkative?: boolean;
}

interface MoveData {
	state: [
		STATE_PREV_X: number,
		STATE_PREV_Y: number,
		STATE_CPU: number,
		STATE_STUCK: number,
		STATE_DEST_X: number,
		STATE_DEST_Y: number,
		STATE_DEST_ROOMNAME: string,
		STATE_CURRENT_X?: number,
		STATE_CURRENT_Y?: number,
	];
	path: string;
	roomVisibility: { [roomName: string]: boolean };
	delay?: number;
	fleeWait?: number;
	destination?: ProtoPos;
	priority?: number;
	// waypoints?: string[];
	// waypointsVisited?: string[];
	portaling?: boolean;
}

interface CachedPath {
	path: RoomPosition[];
	length: number;
	tick: number;
}

interface PathingMemory {
	// paths: { [originName: string]: { [destinationName: string]: CachedPath; } };
	distances: { [pos1Name: string]: { [pos2Name: string]: number } };
	// weightedDistances: { [pos1Name: string]: { [pos2Name: string]: number; } };
}

interface CreepTracker {
	creeps: { [name: string]: number }; // first tick seen
	types: { [type: string]: number }; // amount seen
	parts: { [bodyPart: string]: number }; // quantity
	boosts: { [boostType: string]: number }; // how many boosts are spent
}

interface FlagMemory {
	[MEM.TICK]?: number;
	[MEM.EXPIRATION]?: number;
	[MEM.COLONY]?: string;
	[MEM.DISTANCE]?: {
		[MEM_DISTANCE.UNWEIGHTED]: number;
		[MEM_DISTANCE.WEIGHTED]: number;
		[MEM.EXPIRATION]: number;
		incomplete?: boolean;
	};
	/** Act as a stopgap for the game sometimes not removing flags quickly enough */
	removed?: boolean;
	overlords?: { [name: string]: import("overlords/Overlord").Overlord };
	debug?: boolean;
	amount?: number;
	persistent?: boolean;
	setPos?: ProtoPos;
	rotation?: number;
	maxPathLength?: number;
	pathNotRequired?: boolean;
	maxLinearRange?: number;
	allowPortals?: boolean;
	recalcColonyOnTick?: number;

	combatIntel?: any;
}

// Room memory key aliases to minimize memory size

declare const enum MEM {
	TICK = "T",
	EXPIRATION = "X",
	COLONY = "C",
	OVERLORD = "O",
	DISTANCE = "D",
	STATS = "S",
}

declare const enum MEM_DISTANCE {
	UNWEIGHTED = "u",
	WEIGHTED = "w",
}
