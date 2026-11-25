package com.erp.leave;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import com.erp.common.RequestStatus;

import jakarta.persistence.LockModeType;

public interface AbsenceRequestRepository extends JpaRepository<AbsenceRequest, Long> {

	/** Absences d'un statut chevauchant [from, to[ (endDate inclus). */
	@Query("""
			select a from AbsenceRequest a
			where a.status = :status and a.startDate < :to and a.endDate >= :from
			order by a.startDate""")
	List<AbsenceRequest> findByStatusOverlapping(RequestStatus status, LocalDate from, LocalDate to);

	/** Absences d'un employé dans les statuts donnés touchant [start, end] (bornes incluses). */
	@Query("""
			select a from AbsenceRequest a
			where a.userId = :userId and a.status in :statuses and a.startDate <= :end and a.endDate >= :start""")
	List<AbsenceRequest> findOverlapping(Long userId, LocalDate start, LocalDate end,
			Collection<RequestStatus> statuses);

	@Query("""
			select coalesce(sum(a.hours), 0) from AbsenceRequest a
			where a.userId = :userId and a.type = :type and a.status = :status""")
	BigDecimal sumHours(Long userId, AbsenceType type, RequestStatus status);

	List<AbsenceRequest> findByUserIdOrderByStartDateDesc(Long userId);

	List<AbsenceRequest> findByUserIdAndTypeAndStatusOrderByStartDateDesc(Long userId, AbsenceType type,
			RequestStatus status);

	List<AbsenceRequest> findByStatusOrderByCreatedAt(RequestStatus status);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select a from AbsenceRequest a where a.id = :id")
	java.util.Optional<AbsenceRequest> lockById(Long id);

}
