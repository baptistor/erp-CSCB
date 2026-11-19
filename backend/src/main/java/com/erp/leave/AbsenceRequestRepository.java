package com.erp.leave;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface AbsenceRequestRepository extends JpaRepository<AbsenceRequest, Long> {

	/** Absences APPROVED chevauchant [from, to[ (endDate inclus). */
	@Query("""
			select a from AbsenceRequest a
			where a.status = 'APPROVED' and a.startDate < :to and a.endDate >= :from
			order by a.startDate""")
	List<AbsenceRequest> findApprovedOverlapping(LocalDate from, LocalDate to);

}
