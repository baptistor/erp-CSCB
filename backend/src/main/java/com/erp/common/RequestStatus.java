package com.erp.common;

/** Workflow commun aux demandes : PENDING → APPROVED | REJECTED (admin) ; PENDING → CANCELLED (demandeur). */
public enum RequestStatus {

	PENDING, APPROVED, REJECTED, CANCELLED

}
