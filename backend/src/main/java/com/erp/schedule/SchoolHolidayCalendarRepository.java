package com.erp.schedule;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import jakarta.persistence.LockModeType;

public interface SchoolHolidayCalendarRepository extends JpaRepository<SchoolHolidayCalendar, Short> {

	/** La ligne unique (créée par la migration), verrouillée : deux validations simultanées sont sérialisées. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select c from SchoolHolidayCalendar c where c.id = 1")
	Optional<SchoolHolidayCalendar> lockSingleton();

}
