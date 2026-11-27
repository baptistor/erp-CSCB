package com.erp.overtime;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import com.erp.common.RequestStatus;

import jakarta.persistence.LockModeType;

public interface OvertimeRequestRepository extends JpaRepository<OvertimeRequest, Long> {

	@Query("select coalesce(sum(o.hours), 0) from OvertimeRequest o where o.userId = :userId and o.status = :status")
	BigDecimal sumHours(Long userId, RequestStatus status);

	List<OvertimeRequest> findByUserIdOrderByWorkDateDesc(Long userId);

	List<OvertimeRequest> findByUserIdAndStatusOrderByWorkDateDesc(Long userId, RequestStatus status);

	List<OvertimeRequest> findByStatusOrderByCreatedAt(RequestStatus status);

	/** Heures sup posées sur le planning (avec plage horaire) dans les statuts donnés, sur [from, to[. */
	@Query("""
			select o from OvertimeRequest o
			where o.status in :statuses and o.workDate >= :from and o.workDate < :to
			order by o.workDate, o.startTime""")
	List<OvertimeRequest> findPlaced(Collection<RequestStatus> statuses, LocalDate from, LocalDate to);

	@Query("""
			select o from OvertimeRequest o
			where o.userId = :userId and o.workDate = :date and o.status in :statuses""")
	List<OvertimeRequest> findPlaced(Long userId, LocalDate date, Collection<RequestStatus> statuses);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select o from OvertimeRequest o where o.id = :id")
	java.util.Optional<OvertimeRequest> lockById(Long id);

}
