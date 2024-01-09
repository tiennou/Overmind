import { PortalInfo } from "../intel/RoomIntel";
import {
	ERR_CANNOT_PUSH_CREEP,
	ERR_NOT_IMPLEMENTED,
	ERR_SWARM_BUSY,
	ERR_SWARM_ROTATE_FAILED,
	NO_ACTION,
} from "../utilities/errors";

export interface MoveOptions {
	/** enable debug output */
	debug?: boolean;
	/** whether to ignore Zerg.blockMovement */
	force?: boolean;
	/** ignore creeps currently standing on the destination */
	ignoreCreepsOnDestination?: boolean;
	/** range to approach target */
	range?: number;
	/** range to flee from targets */
	fleeRange?: number;
	/** appends a direction to path in case creep moves */
	movingTarget?: boolean;
	/** creep is marked stuck after this many idle ticks */
	stuckValue?: number;
	/** probability of repathing on a given tick */
	repathChance?: number;
	/** whether to ignore pushing behavior */
	noPush?: boolean;
	pathOpts?: PathOptions;
}

export interface SwarmMoveOptions extends MoveOptions {
	/** ignore pathing around structures */
	ignoreStructures?: boolean;
	/** visualize the final cost matrix */
	displayCostMatrix?: boolean;
}

export interface CombatMoveOptions {
	debug?: boolean;
	allowExit?: boolean;
	avoidPenalty?: number;
	approachBonus?: number;
	preferRamparts?: boolean;
	requireRamparts?: boolean;
	displayCostMatrix?: boolean;
	displayAvoid?: boolean;
	blockMyCreeps?: boolean;
	blockHostileCreeps?: boolean;
	blockAlliedCreeps?: boolean;
}

export interface MoveState {
	stuckCount: number;
	lastCoord: Coord;
	destination: RoomPosition;
	cpu: number;
	currentXY?: Coord;
}

export type ZergMoveReturnCode =
	| CreepMoveReturnCode
	| ERR_NO_PATH
	| ERR_CANNOT_PUSH_CREEP
	| ERR_NOT_IN_RANGE
	| NO_ACTION;

export type ZergSwarmMoveReturnCode =
	| ZergMoveReturnCode
	| ERR_SWARM_BUSY
	| ERR_NOT_IMPLEMENTED
	| ERR_SWARM_ROTATE_FAILED;

export type FIND_EXIT_PORTAL = 42;
export const FIND_EXIT_PORTAL: FIND_EXIT_PORTAL = 42;
export type AnyExitConstant =
	| FIND_EXIT_TOP
	| FIND_EXIT_RIGHT
	| FIND_EXIT_BOTTOM
	| FIND_EXIT_LEFT
	| FIND_EXIT_PORTAL;

/** stop that */

export type Route = { exit: AnyExitConstant; room: string }[];

export const TERRAIN_PLAIN_DEFAULT_COST = 1;
export const TERRAIN_SWAMP_DEFAULT_COST = 5;

export interface TerrainCosts {
	plainCost: number;
	swampCost: number;
	/** road costs; 'auto' = set to ceil(plain/2); unset = ignore roads */
	roadCost?: number | "auto";
}

export interface PathingReturn extends PathFinderPath {
	route: Route | undefined;
	usesPortals: boolean;
	portalUsed: PortalInfo | undefined;
}

export const MatrixTypes = {
	direct: "dir",
	default: "def",
	sk: "sk",
	obstacle: "obst",
	preferRampart: "preframp",
	nearRampart: "nearRamp",
};

export interface PathOptions {
	/** enable debug output */
	debug?: boolean;
	range?: number;
	/** range to flee from targets */
	fleeRange?: number;
	/** terrain costs, determined automatically for creep body if unspecified */
	terrainCosts?: TerrainCosts;
	/** don't path through these room positions */
	obstacles?: RoomPosition[];
	/** ensures you stay in the room you're currently in */
	blockExits?: boolean;
	/** ignore pathing around creeps */
	blockCreeps?: boolean;
	/** ignore pathing around structures */
	ignoreStructures?: boolean;
	/**
	 * Allow to path through hostile rooms; origin/destination room excluded
	 *
	 * `true` means we'll ignore the safe level of the room, `false` we'll consider it,
	 * and a number acts as a cutoff for how safe we want to be
	 * (see {@link SafetyData.threatLevel})
	 */
	allowHostile?: boolean | number;
	/** avoid walking within range 4 of source keepers */
	avoidSK?: boolean;
	/** allow pathing through portals */
	allowPortals?: boolean;
	/** skip portal search unless desination is at least this many rooms away */
	usePortalThreshold?: number;
	/** portals must be within this many rooms to be considered for search */
	portalsMustBeInRange?: number | undefined;
	/** manually supply the map route to take */
	route?: Route;
	/** maximum number of rooms to path through */
	maxRooms?: number;
	/** whether to use the route finder; determined automatically otherwise */
	useFindRoute?: boolean;
	/** pathfinding times out after this many operations */
	maxOps?: number;
	/** can be useful if route keeps being found as incomplete */
	ensurePath?: boolean;
	/** modifications to default cost matrix calculations */
	modifyRoomCallback?: (
		roomName: string,
		matrix: CostMatrix
	) => CostMatrix | false;
}
