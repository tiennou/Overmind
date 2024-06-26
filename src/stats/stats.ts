import { Mem } from "../memory/Memory";
import { profile } from "../profiler/decorator";
import { ema } from "../utilities/utils";

/**
 * Operational statistics, stored in Memory.stats, will be updated every (this many) ticks
 */
const LOG_STATS_INTERVAL = 8;

@profile
export class Stats {
	static get shouldLog() {
		return Game.time % LOG_STATS_INTERVAL === 0;
	}

	static clean() {
		if (!this.shouldLog) {
			return;
		}

		const protectedKeys = ["persistent"];
		for (const key in Memory.stats) {
			if (!protectedKeys.includes(key)) {
				// @ts-expect-error global shenaningans
				delete Memory.stats[key];
			}
		}
	}

	static log(
		key: string,
		value: number | { [key: string]: number } | undefined,
		truncateNumbers = true
	): void {
		if (!this.shouldLog) {
			return;
		}

		if (truncateNumbers && value != undefined) {
			const decimals = 5;
			if (typeof value == "number") {
				value = value.truncate(decimals);
			} else {
				for (const i in value) {
					value[i] = value[i].truncate(decimals);
				}
			}
		}
		Mem.setDeep(Memory.stats, key, value);
	}

	// static accumulate(key: string, value: number): void {
	// 	if (!Memory.stats[key]) {
	// 		Memory.stats[key] = 0;
	// 	}
	// 	Memory.stats[key] += value;
	// }

	static run() {
		if (this.shouldLog) {
			// Record IVM heap statistics
			if (Game.cpu.getHeapStatistics) {
				Memory.stats["cpu.heapStatistics"] =
					Game.cpu.getHeapStatistics();
			}
			// Log GCL
			this.log("gcl.progress", Game.gcl.progress);
			this.log("gcl.progressTotal", Game.gcl.progressTotal);
			this.log("gcl.level", Game.gcl.level);
			// Log memory usage
			this.log("memory.used", RawMemory.get().length);
			// Log CPU
			this.log("cpu.limit", Game.cpu.limit);
			this.log("cpu.bucket", Game.cpu.bucket);
		}
		const used = Game.cpu.getUsed();
		this.log("cpu.getUsed", used);
		Memory.stats.persistent.avgCPU = ema(
			used,
			Memory.stats.persistent.avgCPU,
			100
		);
		Memory.stats.persistent.empireAge = Memory.tick;
		Memory.stats.persistent.build = Memory.build;
	}
}
