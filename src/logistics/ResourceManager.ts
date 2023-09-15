type ManagedResourceStructure = StructureStorage | StructureTerminal;

/**
 * Resource manager; makes high-level decisions based on resource amounts & capacity
 */
export class ResourceManager {
	static settings = {
		storage: {
			total: {
				overfill: 100000,
				dump: 5000,
			},
			energy: {
				/** Won't rebuild terminal until you have this much energy in storage */
				destroyTerminalThreshold: 200000,
			},
		},
		terminal: {
			total: {
				overfill: 50000,
				dump: 5000,
			},
		},
	};

	/** Check if the given storage structure is getting close to full */
	static isOverCapacity(store: ManagedResourceStructure) {
		return (
			store.store.getUsedCapacity() >
			store.store.getCapacity() -
				this.settings[store.structureType].total.overfill
		);
	}
}
