interface Permacache {
	bodypartCounts: { [creep: Id<Creep>]: Record<BodyPartConstant, number> };
	terrainMatrices: { [key: string]: CostMatrix };
	isPlayer: { [id: Id<Creep>]: boolean };
	structureWalkability: {
		[id: Id<ConstructionSite<BuildableStructureConstant>>]: boolean;
	};
	cartographerRoomTypes: {
		[roomName: string]: import("utilities/Cartographer").RoomType;
	};
	_packedRoomNames: { [roomName: string]: string };
	_unpackedRoomNames: { [roomName: string]: string };
	positionNeighbors: { [posCoords: string]: RoomPosition[] };
	tunnelLocations: {
		[roomName: string]: {
			expiration: number;
			tunnels: RoomPosition[];
		};
	};
}

// @ts-expect-error Partial initialization
export const PERMACACHE: Permacache = {};
