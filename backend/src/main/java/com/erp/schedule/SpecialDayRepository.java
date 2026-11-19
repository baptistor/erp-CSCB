package com.erp.schedule;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SpecialDayRepository extends JpaRepository<SpecialDay, Long> {

	List<SpecialDay> findByDayDateGreaterThanEqualAndDayDateLessThan(LocalDate from, LocalDate to);


	boolean existsByUserIdAndDayDate(Long userId, LocalDate dayDate);

	java.util.Optional<SpecialDay> findByUserIdAndDayDate(Long userId, LocalDate dayDate);

	boolean existsByUserIdAndDayDateAndIdNot(Long userId, LocalDate dayDate, Long id);

}
