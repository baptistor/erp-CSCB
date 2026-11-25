package com.erp.schedule;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TypicalDayRepository extends JpaRepository<TypicalDay, Long> {

	List<TypicalDay> findByUserIdAndWeekTypeOrderByDayOfWeek(Long userId, WeekType weekType);

}
