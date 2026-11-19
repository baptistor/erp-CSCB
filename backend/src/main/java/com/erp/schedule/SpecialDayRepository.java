package com.erp.schedule;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SpecialDayRepository extends JpaRepository<SpecialDay, Long> {

	List<SpecialDay> findByDayDateGreaterThanEqualAndDayDateLessThan(LocalDate from, LocalDate to);

	List<SpecialDay> findByUserIdAndDayDateGreaterThanEqualOrderByDayDate(Long userId, LocalDate from);

	boolean existsByUserIdAndDayDate(Long userId, LocalDate dayDate);

	boolean existsByUserIdAndDayDateAndIdNot(Long userId, LocalDate dayDate, Long id);

}
