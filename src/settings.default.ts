// Global settings file containing player information
import {
	getMyUsername,
	getReinforcementLearningTrainingVerbosity,
	onPublicServer,
	onTrainingEnvironment,
} from "./utilities/utils";

/**
 * My Screeps username; used for a variety of updating and communications purposes. (Changing this might break things.)
 */
export const MUON = "Muon";

/**
 * Your username - you shouldn't need to change this.
 */
export const MY_USERNAME: string = getMyUsername();

/**
 * Enable this to build from source including screeps-profiler. (This is separate from Overmind-Profiler.)
 */
export const USE_SCREEPS_PROFILER: boolean = false;

/**
 * Profiling is incredibly expensive and can cause the script to time out. By setting this option, you can limit the
 * number of colonies that will be handled while profiling. Colonies above this limit do not get run.
 */
export const PROFILER_COLONY_LIMIT = Math.ceil(Game.gcl.level / 2);

/**
 * While profiling, ensure these colonies are included in the randomly chosen ones specified by PROFILER_COLONY_LIMIT.
 */
export const PROFILER_INCLUDE_COLONIES: string[] = [
	/* 'E15S49'*/
];

/**
 * Enable this to wrap evaluations of constructor, init, and run phase for each colony in try...catch statemenets.
 */
export const USE_TRY_CATCH: boolean = true;

/**
 * Enable this to suppress alerts of invalid flag color codes. (Don't do this unless you know what you're doing.)
 */
export const SUPPRESS_INVALID_DIRECTIVE_ALERTS: boolean = false;

/**
 * Default controller signature; don't change this.
 * You can set your controller signature with the console command "setSignature()"
 * Operation will be penalized by skipping every 3rd tick for using a signature that does not contain the substring
 * "overmind" or the small-caps variant.
 */
const OVERMIND_SMALL_CAPS = "\u1D0F\u1D20\u1D07\u0280\u1D0D\u026A\u0274\u1D05";
export const DEFAULT_OVERMIND_SIGNATURE = `«${OVERMIND_SMALL_CAPS}»`;

/**
 * If this is enabled, Memory.bot will default to true. This will not change the mode if already set - use setMode().
 */
export const DEFAULT_OPERATION_MODE: operationMode = "automatic";

/**
 * Limit how many rooms you can claim (for any shard)
 */
export const MAX_SHARD_OWNED_ROOMS: { [shardName: string]: number } = {
	shard3: 3, // shard3 has a CPU limit of 20, only claim this many rooms
};

/**
 * Maximum limit for shards not specified in {@link MAX_SHARD_OWNED_ROOMS}
 */
export const MAX_OWNED_ROOMS = Infinity;

/**
 * List of known shards for the server
 */
export const SERVER_SHARDS = ["shard0", "shard1", "shard2", "shard3"];

/**
 * The amount of credits that Overmind will try to keep in the bank. Default:
 * Private servers: 1,000 (will spend aggressively)
 * Public servers: 100,000 if you are below RCL 10, otherwise 1,000,000.
 */
export const RESERVE_CREDITS =
	onPublicServer() ?
		Game.gcl.level >= 10 ?
			1e6
		:	1e5
	:	1000;

/**
 * The global Overmind object will be re-instantiated after this many ticks. In the meantime, refresh() is used.
 */
export const NEW_OVERMIND_INTERVAL = onPublicServer() ? 20 : 5;

/**
 * How frequently should we log statistics
 */
export const LOG_STATS_INTERVAL = 60;

/**
 * Master scale for the RoomVisuals GUI // TODO: not plugged in yet
 */
export const GUI_SCALE = 1.0;

/**
 * If this is set to true, a stripped-down version of Overmind suitable for training with my python screeps environment
 * will be run instead. The main loop will be disabled and creeps will be controlled based on serialized actions
 * communicated to them from the RL model through memory.
 * WARNING: enabling RL_TRAINING_MODE will wipe the contents of your memory!
 */
export const RL_TRAINING_MODE = onTrainingEnvironment();

/**
 * Configure how much stuff gets logged to console
 * 0: no logging
 * 1: log every 100th, 101th tick
 * 2: log every tick
 */
export const RL_TRAINING_VERBOSITY =
	getReinforcementLearningTrainingVerbosity();

// #region Terminal Network thresholds

export const TERMINAL_NETWORK_DEFAULT_TARGET = 2 * LAB_MINERAL_CAPACITY + 1000; // 7000 is default for most resources
export const TERMINAL_NETWORK_DEFAULT_SURPLUS = 15 * LAB_MINERAL_CAPACITY; // 45000 is default surplus
export const TERMINAL_NETWORK_ENERGY_SURPLUS = 500000;
export const TERMINAL_NETWORK_DEFAULT_TOLERANCE = LAB_MINERAL_CAPACITY / 3; // 1000 is default tolerance

export const TERMINAL_NETWORK_THRESHOLDS: TerminalNetworkThresholds = {
	default: {
		target: TERMINAL_NETWORK_DEFAULT_TARGET,
		tolerance: TERMINAL_NETWORK_DEFAULT_TOLERANCE,
		surplus: TERMINAL_NETWORK_DEFAULT_SURPLUS,
	},
	/** thresholds for stuff you don't need but don't not want */
	dontCare: {
		target: 0,
		tolerance: 0,
		surplus: undefined,
	},
	/** thresholds for stuff you actively don't want */
	dontWant: {
		target: 0,
		tolerance: 0,
		surplus: 0,
	},
	boostsT1: {
		target: TERMINAL_NETWORK_DEFAULT_TARGET + 2 * LAB_MINERAL_CAPACITY, // max: 7000 + 2*6000 = 19000 -> 14% capacity for all T1
		surplus: 25000,
		tolerance: TERMINAL_NETWORK_DEFAULT_TARGET + 2 * LAB_MINERAL_CAPACITY,
	},
	boostsT2: {
		target: TERMINAL_NETWORK_DEFAULT_TARGET + 2 * LAB_MINERAL_CAPACITY, // max: 7000 + 2*6000 = 19000 -> 14% capacity for all T2
		surplus: 25000,
		tolerance: TERMINAL_NETWORK_DEFAULT_TARGET + 2 * LAB_MINERAL_CAPACITY,
	},
	boostsT3: {
		target: TERMINAL_NETWORK_DEFAULT_TARGET + 10 * LAB_MINERAL_CAPACITY, // max: 7000 + 2*30000 = 67000 -> 51% capacity for all T3
		surplus: 75000,
		tolerance:
			TERMINAL_NETWORK_DEFAULT_TOLERANCE + 10 * LAB_MINERAL_CAPACITY,
	},
	intermediates: {
		target: LAB_MINERAL_CAPACITY + 1000,
		surplus: 3 * LAB_MINERAL_CAPACITY,
		tolerance: LAB_MINERAL_CAPACITY / 3,
	},
	/** this takes a long time to make so let's keep a bit more of it around */
	[RESOURCE_HYDROXIDE]: {
		target: TERMINAL_NETWORK_DEFAULT_TARGET,
		tolerance: TERMINAL_NETWORK_DEFAULT_TOLERANCE,
		surplus: TERMINAL_NETWORK_DEFAULT_SURPLUS,
	},
	[RESOURCE_GHODIUM]: {
		target: 10000,
		tolerance: 5000,
		surplus: 20000,
	},
	[RESOURCE_POWER]: {
		// low target ensures power gets spread among room (cheaper than shipping energy)
		target: 2500,
		tolerance: 2500,
		surplus: undefined,
	},
	[RESOURCE_OPS]: {
		target: 2500,
		tolerance: 2500,
		surplus: undefined,
	},
};

// #endregion

/**
 * This will get used as defaults when building Memory.settings.
 * Use it to provide specific values when spawning/respawning.
 */
export const DEFAULT_SETTINGS: PartialDeep<MemorySettings> = {};
