package com.erp.schedule;

import java.time.Duration;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;

/** Plage horaire d'une journée ; start/end null = « non travaillé ». */
public record TimeRange(LocalTime start, LocalTime end) {

	public static final TimeRange NOT_WORKED = new TimeRange(null, null);

	/** Pause de midi obligatoire, jamais travaillée (spec §1). */
	public static final TimeRange BREAK = new TimeRange(LocalTime.of(12, 30), LocalTime.of(13, 30));

	public boolean worked() {
		return start != null;
	}

	public long minutes() {
		return worked() ? Duration.between(start, end).toMinutes() : 0;
	}

	/** Les deux plages ont du temps en commun (des plages contiguës ne se chevauchent pas). */
	public boolean overlaps(TimeRange other) {
		return worked() && other.worked() && start.isBefore(other.end) && other.start.isBefore(end);
	}

	/** On peut commencer une absence à cette heure (début compris, fin exclue). */
	public boolean canStartAt(LocalTime time) {
		return worked() && !time.isBefore(start) && time.isBefore(end);
	}

	/** On peut finir une absence à cette heure (début exclu, fin comprise). */
	public boolean canEndAt(LocalTime time) {
		return worked() && time.isAfter(start) && !time.isAfter(end);
	}

	/** Minutes communes avec [from, to]. */
	public long minutesWithin(LocalTime from, LocalTime to) {
		if (!overlaps(new TimeRange(from, to))) {
			return 0;
		}
		return Duration.between(from.isAfter(start) ? from : start, to.isBefore(end) ? to : end).toMinutes();
	}

	/** Parties de cette plage en dehors de toutes les {@code others}. */
	List<TimeRange> outside(Collection<TimeRange> others) {
		List<TimeRange> parts = List.of(this);
		for (TimeRange other : others) {
			parts = parts.stream().flatMap(part -> part.outside(other).stream()).toList();
		}
		return parts;
	}

	/** Parties de cette plage en dehors de {@code other} (0, 1 ou 2 plages). */
	private List<TimeRange> outside(TimeRange other) {
		if (!overlaps(other)) {
			return List.of(this);
		}
		List<TimeRange> parts = new ArrayList<>();
		if (start.isBefore(other.start)) {
			parts.add(new TimeRange(start, other.start));
		}
		if (end.isAfter(other.end)) {
			parts.add(new TimeRange(other.end, end));
		}
		return parts;
	}

	/** Plages travaillées triées, celles qui se touchent ou se chevauchent étant fusionnées. */
	static List<TimeRange> merge(Collection<TimeRange> ranges) {
		List<TimeRange> merged = new ArrayList<>();
		for (TimeRange range : ranges.stream().filter(TimeRange::worked).sorted(Comparator.comparing(TimeRange::start)).toList()) {
			TimeRange last = merged.isEmpty() ? null : merged.getLast();
			if (last != null && !range.start.isAfter(last.end)) {
				merged.set(merged.size() - 1, new TimeRange(last.start, range.end.isAfter(last.end) ? range.end : last.end));
			}
			else {
				merged.add(range);
			}
		}
		return merged;
	}

}
