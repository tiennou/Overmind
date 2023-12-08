import { SEGMENTS, Segmenter } from "memory/Segmenter";
import { Mem } from "../memory/Memory";
import { profile } from "../profiler/decorator";
import { ema, tickClock } from "../utilities/utils";
import { log } from "console/log";
import { config } from "config";

/**
 * Operational statistics, stored in Memory.stats, will be updated every (this many) ticks
 */
const LOG_STATS_INTERVAL = config.LOG_STATS_INTERVAL ?? 8;

@profile
export class Stats {
	private static get mode(): "memory" | "segment" {
		return "memory";
	}

	private static get useMemory() {
		return this.mode === "memory";
	}

	private static get useSegment() {
		return this.mode === "segment";
	}

	static get shouldLog() {
		return tickClock(LOG_STATS_INTERVAL) === 0;
	}

	static clean() {
		if (!this.shouldLog) {
			return;
		}
		log.info(`Stats.clean!`);

		const protectedKeys = ["persistent"];
		if (this.useMemory) {
			for (const key in Memory.stats) {
				if (!protectedKeys.includes(key)) {
					// @ts-expect-error global shenaningans
					delete Memory.stats[key];
				}
			}
		}
		if (this.useSegment) {
			const segment = Segmenter.getSegment(SEGMENTS.stats);
			for (const key in segment) {
				if (!protectedKeys.includes(key)) {
					delete segment[key];
				}
			}
			Segmenter.setSegment(SEGMENTS.stats, segment);
		}
	}

	static set(
		key: string,
		value: number | { [key: string]: number } | undefined
	) {
		// log.info(`Stats.set: key: "${key}": ${JSON.stringify(value)}`);
		if (this.useMemory) {
			Mem.setDeep(Memory.stats, key, value);
		}

		if (this.useSegment) {
			const stats = Segmenter.getSegment(SEGMENTS.stats);
			// log.info(
			// 	`Stats.set: segment: ${JSON.stringify(
			// 		Segmenter.getSegment(SEGMENTS.stats)
			// 	)}`
			// );
			Mem.setDeep(stats, key, value);
			// log.info(`Stats.set: set: ${JSON.stringify(stats)}`);
			Segmenter.setSegment(SEGMENTS.stats, stats);
			// log.info(
			// 	`Stats.set: final: ${JSON.stringify(
			// 		Segmenter.getSegment(SEGMENTS.stats)
			// 	)}`
			// );
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
		this.set(key, value);
	}

	static avg(key: string, value: number, window: number) {
		let source;
		if (this.useMemory) {
			source = Memory.stats;
		} else {
			source = Segmenter.getSegment(SEGMENTS.stats);
		}
		const current: number = _.get(source, key);
		const avg = ema(value, current, window);
		this.set(key, avg);
	}

	// static accumulate(key: string, value: number): void {
	// 	if (!Memory.stats[key]) {
	// 		Memory.stats[key] = 0;
	// 	}
	// 	Memory.stats[key] += value;
	// }

	static run() {
		const clock = tickClock(LOG_STATS_INTERVAL);
		// log.info(
		// 	`Stats.run: ${clock} segment:\n${JSON.stringify(
		// 		Segmenter.getSegment(SEGMENTS.stats)
		// 	)}`
		// );
		switch (clock) {
			case -1: {
				if (!this.useSegment) {
					break;
				}
				Segmenter.requestSegments(SEGMENTS.stats);
				// fall-through
			}
			default:
				// return; the rest of that method is about stats updates
				return;
			case 0:
				// fall-through, since it's time now
				break;
		}

		// Record IVM heap statistics
		if (Game.cpu.getHeapStatistics) {
			this.set(
				"cpu.heapStatistics",
				<{ [key: string]: any }>Game.cpu.getHeapStatistics()
			);
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
		const used = Game.cpu.getUsed();
		this.log("cpu.getUsed", used);
		this.avg("persistent.avgCPU", used, LOG_STATS_INTERVAL);
		this.log("persistent.empireAge", Memory.tick);
		this.log("persistent.build", Memory.build);
		if (this.useSegment) {
			// FIXME: There are a few things we have to grab back out of memory
			this.log("persistent.time", Memory.stats.persistent.time);
			this.log(
				"persistent.lastBucket",
				Memory.stats.persistent.lastBucket
			);
			this.log(
				"persistent.lastErrorTick",
				Memory.stats.persistent.lastErrorTick
			);
			this.log(
				"persistent.avgBucketDelta",
				Memory.stats.persistent.avgBucketDelta
			);
			this.log(
				"persistent.lastGlobalReset",
				Memory.stats.persistent.lastGlobalReset
			);
			this.set(
				"persistent.trader",
				<{ [key: string]: any }>Memory.stats.persistent.trader
			);
			this.set(
				"persistent.terminalNetwork",
				<{ [key: string]: any }>Memory.stats.persistent.terminalNetwork
			);
		}
		// if (this.useMemory) {
		// 	log.info(
		// 		`Stats.run: ${clock} done:\n` +
		// 			`memory: ${JSON.stringify(Memory.stats)}`
		// 	);
		// }
		// if (this.useSegment) {
		// 	log.info(
		// 		`Stats.run: ${clock} done:\n` +
		// 			`segment: ${JSON.stringify(
		// 				Segmenter.getSegment(SEGMENTS.stats)
		// 			)}\n` +
		// 			`raw: ${RawMemory.segments[55]}`
		// 	);
		// }
	}
}
