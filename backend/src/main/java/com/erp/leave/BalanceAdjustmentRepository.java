package com.erp.leave;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface BalanceAdjustmentRepository extends JpaRepository<BalanceAdjustment, Long> {

	@Query("select coalesce(sum(b.hours), 0) from BalanceAdjustment b where b.userId = :userId")
	BigDecimal sumHours(Long userId);

	List<BalanceAdjustment> findByUserIdOrderByCreatedAtDesc(Long userId);

}
