package com.erp.schedule;

import java.time.LocalDate;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SchoolHolidayWeekRepository extends JpaRepository<SchoolHolidayWeek, LocalDate> {

}
