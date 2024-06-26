interface Creep {
	hitsPredicted?: number;
	intel?: { [property: string]: number };
	memory: CreepMemory;
	boosts: ResourceConstant[];
	boostCounts: { [boostType: string]: number };
	inRampart: boolean;
	approxMoveSpeed: number;
	bodypartCounts: { [bodypart in BodyPartConstant]: number };
	isPlayer: true;

	// private
	_boosts: ResourceConstant[];
	_boostCounts: { [boostType: string]: number };
	_inRampart: boolean;
	_moveSpeed: number;
}

interface PowerCreep {
	hitsPredicted?: number;
	intel?: { [property: string]: number };
	memory: CreepMemory;
	inRampart: boolean;
	withdraw(
		target: Structure | Tombstone | Ruin,
		resourceType: ResourceConstant,
		amount?: number
	): ScreepsReturnCode;
}

interface CostMatrix {
	_bits: Uint8Array;
}

interface ConstructionSite {
	isWalkable: boolean;
}

interface Flag {}

type Sink =
	| StructureSpawn
	| StructureExtension
	| StructureLab
	| StructurePowerSpawn
	| StructureNuker
	| StructureTower;

type StorageUnit = StructureContainer | StructureTerminal | StructureStorage;

type rechargeObjectType =
	| StructureStorage
	| StructureTerminal
	| StructureContainer
	| StructureLink
	| Tombstone
	| Ruin
	| Resource;

interface Room {
	print: string;

	my: boolean;

	isColony: boolean;
	isOutpost: boolean;

	owner: string | undefined;
	reservedByMe: boolean;
	signedByMe: boolean;

	creeps: Creep[];
	hostiles: Creep[];
	friendlies: Creep[];
	invaders: Creep[];
	sourceKeepers: Creep[];
	dangerousHostiles: Creep[];
	playerHostiles: Creep[];
	dangerousPlayerHostiles: Creep[];

	// Populated and tracked by RoomIntel
	isSafe: boolean;
	threatLevel: number;
	instantaneousThreatLevel: 0 | 0.5 | 1;

	/**
	 * Things to stay away from in the room
	 */
	fleeDefaults: _HasRoomPosition[];

	structures: Structure[];
	hostileStructures: Structure[];

	flags: Flag[];

	// Cached structures
	tombstones: Tombstone[];
	drops: { [resourceType: string]: Resource[] };
	droppedEnergy: Resource[];
	droppedPower: Resource[];

	// Room structures
	_refreshStructureCache(): void;

	// Multiple structures
	spawns: StructureSpawn[];
	extensions: StructureExtension[];
	roads: StructureRoad[];
	walls: StructureWall[];
	constructedWalls: StructureWall[];
	ramparts: StructureRampart[];
	walkableRamparts: StructureRampart[];
	barriers: (StructureWall | StructureRampart)[];
	storageUnits: StorageUnit[];
	keeperLairs: StructureKeeperLair[];
	portals: StructurePortal[];
	links: StructureLink[];
	towers: StructureTower[];
	labs: StructureLab[];
	containers: StructureContainer[];
	powerBanks: StructurePowerBank[];

	// Single structures
	observer: StructureObserver | undefined;
	powerSpawn: StructurePowerSpawn | undefined;
	factory: StructureFactory | undefined;
	invaderCore: StructureInvaderCore | undefined;
	extractor: StructureExtractor | undefined;
	nuker: StructureNuker | undefined;
	repairables: Structure[];
	rechargeables: rechargeObjectType[];
	sources: Source[];
	mineral: Mineral | undefined;
	deposits: Deposit[];
	constructionSites: ConstructionSite[];
	allConstructionSites: ConstructionSite[];
	hostileConstructionSites: ConstructionSite[];
	ruins: Ruin[];

	// Used by movement library
	// _defaultMatrix: CostMatrix;
	// _directMatrix: CostMatrix;
	// _creepMatrix: CostMatrix;
	// _priorityMatrices: { [priority: number]: CostMatrix };
	// _skMatrix: CostMatrix;
	_kitingMatrix: CostMatrix;

	// private caching
	_creeps: Creep[];
	_hostiles: Creep[];
	_friendlies: Creep[];
	_invaders: Creep[];
	_sourceKeepers: Creep[];
	_dangerousHostiles: Creep[];
	_playerHostiles: Creep[];
	_dangerousPlayerHostiles: Creep[];
	_fleeDefaults: _HasRoomPosition[];
	_allStructures: Structure[];
	_hostileStructures: Structure[];
	_flags: Flag[];
	_constructionSites: ConstructionSite[];
	_allConstructionSites: ConstructionSite[];
	_hostileConstructionSites: ConstructionSite[];
	_tombstones: Tombstone[];
	_ruins: Ruin[];
	_deposits: Deposit[];
	_drops: { [resourceType: string]: Resource[] };
}

interface RoomObject {
	print: string;
	ref: string;
	targetedBy: string[];

	serialize(): ProtoRoomObject;

	getEffect(
		effectId: EffectConstant | PowerConstant
	): RoomObjectEffect | null;
}

interface FindOptions<T> {
	filter: object | string | ((obj: T) => boolean);
}

interface RoomPosition {
	/** Debug helper to format the object */
	print: string;
	/** Debug helper to format the object, without linking */
	printPlain: string;
	/**
	 * The room the position is in
	 *
	 * Will be `undefined` if we don't currently have room visibility.
	 */
	room: Room | undefined;
	/** A shortened version of the position, mostly used for cache keys */
	readableName: string;
	// coordName: string;
	/** Whether the position is at the edge of the room */
	isEdge: boolean;
	/** Do we have visibility on the room? */
	isVisible: boolean;
	/** The distance to the nearest room edge */
	rangeToEdge: number;
	/** Position of the room, in world coordinates */
	roomCoords: Coord;
	/** All of the (max. 8) positions bordering this one */
	neighbors: RoomPosition[];

	toCoord(): Coord;

	createConstructionSite(
		structureType: BuildableStructureConstant
	): ScreepsReturnCode;
	// createConstructionSite(structureType: StructureSpawn, name?: string): ScreepsReturnCode;
	_createConstructionSite(
		structureType: BuildableStructureConstant,
		name?: string
	): ScreepsReturnCode;

	inRangeToPos(pos: RoomPosition, range: number): boolean;

	inRangeToXY(x: number, y: number, range: number): boolean;

	getRangeToXY(x: number, y: number): number;

	getPositionsAtRange(
		range: number,
		includeWalls?: boolean,
		includeEdges?: boolean
	): RoomPosition[];

	getPositionsInRange(
		range: number,
		includeWalls?: boolean,
		includeEdges?: boolean
	): RoomPosition[];

	getOffsetPos(dx: number, dy: number): RoomPosition;

	lookForStructure<T extends StructureConstant>(
		structureType: T
	): ConcreteStructure<T> | undefined;

	/**
	 * Can this position be walked on?
	 *
	 * @description Note that if the room is not visible, we can't account for creeps.
	 */
	isWalkable(ignoreCreeps?: boolean): boolean;

	availableNeighbors(ignoreCreeps?: boolean): RoomPosition[];

	getPositionAtDirection(
		direction: DirectionConstant,
		range?: number
	): RoomPosition;

	/** Get an estimate for the distance to another room position in a possibly different room */
	getMultiRoomRangeTo(pos: RoomPosition): number;

	findClosestByLimitedRange<T extends _HasRoomPosition | RoomPosition>(
		this: RoomPosition,
		objects: T[],
		rangeLimit: number,
		opts?: FindOptions<T>
	): T | undefined;

	findClosestByMultiRoomRange<T extends _HasRoomPosition>(
		objects: T[]
	): T | undefined;

	findClosestByRangeThenPath<T extends _HasRoomPosition>(
		objects: T[]
	): T | undefined;
}

interface RoomVisualOptions {
	color?: string;
	opacity?: number;
	textfont?: string;
	textsize?: number;
	textstyle?: string;
	textcolor?: string;
}

interface RoomVisual {
	roads: Point[];

	box(
		x: number,
		y: number,
		w: number,
		h: number,
		style?: LineStyle
	): RoomVisual;

	infoBox(
		info: string[],
		x: number,
		y: number,
		opts?: RoomVisualOptions
	): RoomVisual;

	multitext(
		textLines: string[],
		x: number,
		y: number,
		opts?: RoomVisualOptions
	): RoomVisual;

	structure(
		x: number,
		y: number,
		type: string,
		opts?: RoomVisualOptions
	): RoomVisual;

	connectRoads(opts?: RoomVisualOptions): RoomVisual | void;

	speech(
		text: string,
		x: number,
		y: number,
		opts?: RoomVisualOptions & { background?: string }
	): RoomVisual;

	animatedPosition(
		x: number,
		y: number,
		opts?: RoomVisualOptions & { radius?: number; frames?: number }
	): RoomVisual;

	resource(
		type: ResourceConstant,
		x: number,
		y: number,
		size?: number,
		opacity?: number
	): number;

	_fluid(
		type: string,
		x: number,
		y: number,
		size?: number,
		opacity?: number
	): void;

	_mineral(
		type: string,
		x: number,
		y: number,
		size?: number,
		opacity?: number
	): void;

	_compound(
		type: string,
		x: number,
		y: number,
		size?: number,
		opacity?: number
	): void;

	test(): RoomVisual;
}

interface OwnedStructure {
	_isActive(): boolean;
}

interface Structure {
	/**
	 * Check if a structure can be walked over
	 *
	 * Only true for roads, containers and ramparts.
	 */
	isWalkable: boolean;
}

interface StoreBase {
	contents: StoreContentsArray;
}

interface _StoreLike {
	energy: number;
	isFull: boolean;
	isEmpty: boolean;
}

interface StructureContainer extends _StoreLike {}
interface StructureExtension extends _StoreLike {}
interface StructureLink extends _StoreLike {}
interface StructureStorage extends _StoreLike {}
interface StructureTerminal extends _StoreLike {}
interface StructureSpawn extends _StoreLike {}
interface Tombstone extends _StoreLike {}
interface Ruin extends _StoreLike {}

interface StructureController {
	reservedByMe: boolean;
	signedByMe: boolean;
	signedByScreeps: boolean;
}

interface StructureSpawn extends _StoreLike {
	cost(bodyArray: string[]): number;
}

interface StructureTerminal extends _StoreLike {
	isReady: boolean;
	hasReceived: boolean;

	// private
	_hasReceived: boolean;
	_notReady: boolean;
}

interface StructureTower extends _StoreLike {
	// run(): void;
	//
	// attackNearestEnemy(): number;
	//
	// healNearestAlly(): number;
	//
	// repairNearestStructure(): number;
	//
	// preventRampartDecay(): number;
}

interface StructurePortal {
	shardDestination: { shard: string; room: string } | undefined;
	roomDestination: RoomPosition | undefined;
}

// eslint-disable-next-line
interface Number {
	toPercent(decimals?: number): string;

	truncate(decimals: number): number;
}
